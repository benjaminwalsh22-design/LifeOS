// The Moleskine pen. Its app backs the notebooks up to OneDrive as PDFs (or he
// saves pages there himself); this worker finds that folder, draws each new page
// as a picture and adds it to the journal as a queued entry. transcribe-tick then
// reads it exactly as it reads a page scanned with the phone.
//
//   hold mode (pen_state.live = false): pages are found, drawn and kept ready,
//   but the journal is not touched. Switch live on once the first pages look right.
//
// A page that is written on again later replaces its earlier entry; an entry he
// deleted is never brought back; nothing else in the journal is ever changed.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as mupdf from "npm:mupdf@1.28.6";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const TZ = "America/Los_Angeles";
const HOME = "LifeOS Journal";     // a OneDrive folder he can save pages into by hand
const NAME_RE = /moleskine/i;      // how the pen's own backup is recognised
const WIDTH = 1000, QUALITY = 78;  // the same size the phone uploads its scans at
const RENDER_MS = 1100;            // drawing budget for one run (the platform allows about 2 s of CPU)
const SETTLE_MS = 20 * 60000;      // leave a file alone while it is still being written
const LOOK_EVERY = 6 * 3600000;    // how often to search the drive again once a folder is known
const MAX_BYTES = 60e6, MAX_PAGES = 400, MAX_READDS = 3;
const MAX_REVS = 8;                // after this many rewrites a page's entry is replaced at most once a day
const RELEASE_PER_RUN = 25;        // entries added to the journal in one run
const FLOOD = 60;                  // more new pages than this from one file wait for a look first
const BLANK_INK = 0.0006;          // share of dark pixels below which a page counts as empty
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const te = new TextEncoder();

type Watch = { id: string; path: string; kind: "folder" | "file"; pin?: boolean };

// ---------------------------------------------------------------- OneDrive
async function accessToken(admin: any, row: any): Promise<string> {
  if (row.access_token && (row.expires_at || 0) > Date.now() + 120000) return row.access_token;
  const body = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!, client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    refresh_token: row.refresh_token, grant_type: "refresh_token",
    scope: "offline_access Files.Read.All User.Read",
  });
  const tok = await fetch(AUTH, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(),
  }).then((r) => r.json());
  if (!tok.access_token) {
    await admin.from("ms_auth").update({ last_error: (tok.error_description || "token refresh failed").slice(0, 200) })
      .eq("user_id", row.user_id);
    throw new Error("refresh failed");
  }
  await admin.from("ms_auth").update({
    access_token: tok.access_token, expires_at: Date.now() + (tok.expires_in || 3600) * 1000,
    refresh_token: tok.refresh_token || row.refresh_token, last_error: null,
  }).eq("user_id", row.user_id);
  return tok.access_token;
}

async function graph(tok: string, url: string, tries = 3): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url.startsWith("http") ? url : GRAPH + url, { headers: { Authorization: "Bearer " + tok } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(1000 * (+(res.headers.get("retry-after") || 0) || i + 1));
      continue;
    }
    return await res.json();
  }
  return { error: { message: "throttled" } };
}

export function isPage(it: any): boolean {
  const n = String(it?.name || "").toLowerCase(), m = it?.file?.mimeType || "";
  return !!it?.file && (m === "application/pdf" || m === "image/jpeg" || m === "image/png" || /\.(pdf|jpe?g|png)$/.test(n));
}
export function kindOf(it: any): string {
  const n = String(it?.name || "").toLowerCase(), m = it?.file?.mimeType || "";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "application/pdf";
  if (m === "image/png" || n.endsWith(".png")) return "image/png";
  return "image/jpeg";
}
const pathOf = (it: any) =>
  (String(it?.parentReference?.path || "").replace(/^\/drive\/root:/, "") + "/" + (it?.name || "")).replace(/\/+/g, "/");

// Where the pen's pages are: the hand-filled folder if it exists, and anything
// the Moleskine app has named after itself. The search also matches words inside
// documents, so only a match in the item's own name counts.
async function discover(tok: string): Promise<Watch[]> {
  const out: Watch[] = [];
  const home = await graph(tok, `/me/drive/root:/${encodeURIComponent(HOME)}?$select=id,name,folder`);
  if (home?.id && home.folder) out.push({ id: home.id, path: "/" + HOME, kind: "folder" });
  const res = await graph(tok, "/me/drive/root/search(q='moleskine')?$select=id,name,folder,file,parentReference&$top=50");
  for (const it of res?.value || []) {
    if (!NAME_RE.test(it.name || "")) continue;
    if (it.folder) out.push({ id: it.id, path: pathOf(it), kind: "folder" });
    else if (isPage(it)) out.push({ id: it.id, path: pathOf(it), kind: "file" });
  }
  return out;
}

async function listFiles(tok: string, watch: Watch[]): Promise<any[]> {
  const found = new Map<string, any>();
  const sel = "$select=id,name,file,folder,size,cTag,lastModifiedDateTime";
  const walk = async (id: string, depth: number) => {
    let url = `/me/drive/items/${id}/children?${sel}&$top=200`;
    for (let page = 0; url && page < 5; page++) {
      const r = await graph(tok, url);
      if (r.error) return;
      for (const k of r.value || []) {
        if (k.folder) { if (depth < 3) await walk(k.id, depth + 1); }
        else if (isPage(k)) found.set(k.id, k);
      }
      url = r["@odata.nextLink"] || "";
    }
  };
  for (const w of watch) {
    if (w.kind === "folder") await walk(w.id, 0);
    else {
      const it = await graph(tok, `/me/drive/items/${w.id}?${sel}`);
      if (it?.id && !it.deleted && isPage(it)) found.set(it.id, it);
    }
  }
  return [...found.values()].sort((a, b) => String(a.lastModifiedDateTime).localeCompare(String(b.lastModifiedDateTime)));
}

// ---------------------------------------------------------------- pages
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha1(parts: Uint8Array[]): Promise<string> {
  let n = 0; for (const p of parts) n += p.length;
  const all = new Uint8Array(n); let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return hex(await crypto.subtle.digest("SHA-1", all));
}
// a long stream is told apart by its length and sixteen slices of it
function gist(b: Uint8Array): Uint8Array[] {
  const out = [te.encode("#" + b.length + ":")];
  if (b.length <= 65536) { out.push(b.slice()); return out; }
  const step = Math.floor((b.length - 2048) / 15);
  for (let i = 0; i < 16; i++) out.push(b.slice(i * step, i * step + 2048));
  return out;
}

// A signature for every page of a PDF, made from what the page draws (its
// strokes and any pictures on it) without drawing it. Two backups of the same
// page give the same signature; a page written on again gives a new one.
export async function pageSigs(doc: any): Promise<string[] | null> {
  const pdf = doc.asPDF ? doc.asPDF() : null;
  if (!pdf) return null;
  const n = Math.min(pdf.countPages(), MAX_PAGES), sigs: string[] = [];
  for (let i = 0; i < n; i++) {
    const parts: Uint8Array[] = [], seen = new Set<number>();
    const stream = (o: any): boolean => {
      if (!o || o.isNull() || !o.isStream()) return false;
      if (o.isIndirect()) { const k = o.asIndirect(); if (seen.has(k)) return false; seen.add(k); }
      const sub = o.get("Subtype"), image = !sub.isNull() && sub.isName() && sub.asName() === "Image";
      const buf = image ? o.readRawStream() : o.readStream();   // drawing instructions are compared unpacked
      for (const g of gist(buf.asUint8Array())) parts.push(g);
      if (buf.destroy) buf.destroy();
      return !image;
    };
    const resources = (res: any, depth: number) => {
      if (!res || res.isNull() || !res.isDictionary() || depth > 3) return;
      const xo = res.get("XObject");
      if (xo.isNull() || !xo.isDictionary()) return;
      xo.forEach((v: any) => { if (stream(v)) resources(v.get("Resources"), depth + 1); });
    };
    const pg = pdf.findPage(i);
    parts.push(te.encode(pg.getInheritable("MediaBox").toString()));
    const c = pg.get("Contents");
    if (c.isArray()) for (let k = 0; k < c.length; k++) stream(c.get(k)); else stream(c);
    resources(pg.getInheritable("Resources"), 0);
    sigs.push(await sha1(parts));
  }
  return sigs;
}

// Draw one page the way the phone would have photographed it, and measure how
// much of it is ink.
export function drawPage(doc: any, i: number): { jpg: Uint8Array; w: number; h: number; ink: number } {
  const page = doc.loadPage(i);
  const b = page.getBounds();
  const scale = Math.min(3, WIDTH / Math.max(1, b[2] - b[0]));
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), stride = pix.getStride(), n = pix.getNumberOfComponents();
  const px = pix.getPixels();
  let dark = 0, all = 0;
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const o = y * stride + x * n;
      if ((px[o] * 3 + px[o + 1] * 6 + px[o + 2]) / 10 < 150) dark++;
      all++;
    }
  }
  const jpg = pix.asJPEG(QUALITY).slice();
  pix.destroy(); page.destroy();
  return { jpg, w, h, ink: all ? dark / all : 0 };
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);   // the app's own id shape
const localDay = (iso: string) => new Date(iso || Date.now()).toLocaleDateString("en-CA", { timeZone: TZ });

// What to do with page i of a file, given the rows already kept for that file.
//   known    this exact page has been seen before: nothing to do
//   blank    an empty page: remember it, add nothing
//   new      a page not seen before
//   edit     the page that used to be here has been written on again
//   note     a change to a page whose entry should be left alone
//   wait     written on again too many times in a day (a runaway guard)
export function decide(sig: string, i: number, ink: number | null, bySig: Map<string, any>, gone: any[]): { what: string; prev?: any } {
  if (bySig.has(sig)) return { what: "known" };
  const prev = gone.find((r) => r.page === i) || null;
  if (ink === null) return { what: "draw", prev };
  if (!prev) return { what: ink < BLANK_INK ? "blank" : "new" };
  if (prev.state === "blank") return { what: ink < BLANK_INK ? "note" : "edit", prev };
  if (prev.state === "deleted" || ink < BLANK_INK) return { what: "note", prev };
  if ((prev.revs || 0) >= MAX_REVS && Date.now() - Date.parse(prev.changed_at || 0) < 86400000) return { what: "wait", prev };
  return { what: "edit", prev };
}

function storageUrl(uid: string, eid: string) {
  return `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/journal-photos/${uid}/${encodeURIComponent(eid)}.jpg`;
}
const storageHeaders = () => ({
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
});
async function putPicture(uid: string, eid: string, jpg: Uint8Array): Promise<boolean> {
  const up = await fetch(storageUrl(uid, eid), {
    method: "POST", headers: { ...storageHeaders(), "content-type": "image/jpeg", "x-upsert": "true" }, body: jpg,
  });
  return up.ok;
}
async function dropPicture(uid: string, eid: string) {
  try { await fetch(storageUrl(uid, eid), { method: "DELETE", headers: storageHeaders() }); } catch (_) { /* a stray picture is harmless */ }
}

// Read one file and keep a row (and a picture) for each page that is new or changed.
async function workFile(admin: any, tok: string, uid: string, f: any, budget: { ms: number }) {
  const out = { done: true, fresh: 0, edits: 0, note: "", pages: 0 };
  let doc: any = null;
  try {
    await readFile(admin, tok, uid, f, budget, out, (d: any) => { doc = d; });
  } finally {
    try { if (doc) doc.destroy(); } catch (_) { /* already gone */ }
  }
  // the file's version is recorded once every page of it is dealt with, so it is not fetched again until it changes
  await admin.from("pen_files").upsert({
    user_id: uid, file_id: f.id, name: String(f.name || "").slice(0, 200), modified: f.lastModifiedDateTime,
    pages: out.pages || null, tag: out.done ? f.cTag : null, note: out.note || null, checked_at: new Date().toISOString(),
  }, { onConflict: "user_id,file_id", ignoreDuplicates: false });
  return out;
}

async function readFile(admin: any, tok: string, uid: string, f: any, budget: { ms: number }, out: any, keep: (d: any) => void) {
  if ((f.size || 0) > MAX_BYTES) { out.note = "too large"; return; }
  const res = await fetch(`${GRAPH}/me/drive/items/${f.id}/content`, { headers: { Authorization: "Bearer " + tok } });
  if (!res.ok) { out.done = false; out.note = "download " + res.status; return; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  let doc: any;
  try { doc = mupdf.Document.openDocument(bytes, kindOf(f)); keep(doc); } catch (_) { out.note = "could not be opened"; return; }
  {
    const n = Math.min(doc.countPages(), MAX_PAGES);
    out.pages = n;
    let sigs: string[] | null = null;
    try { sigs = await pageSigs(doc); } catch (_) { sigs = null; }
    if (!sigs) {
      if (n !== 1) { out.note = "pages could not be told apart"; return; }
      sigs = [await sha1([bytes])];                       // a picture file is one page: the file is its signature
    }
    const firstAt = new Map<string, number>();
    sigs.forEach((s2, k) => { if (!firstAt.has(s2)) firstAt.set(s2, k); });
    const day = localDay(f.lastModifiedDateTime);
    const { data: rows } = await admin.from("pen_pages").select("*").eq("user_id", uid).eq("file_id", f.id);
    const bySig = new Map<string, any>((rows || []).map((r: any) => [r.sig, r]));
    const cur = new Set(sigs);
    const gone = (rows || []).filter((r: any) => !cur.has(r.sig));   // pages whose old drawing is no longer in the file

    for (let i = 0; i < n; i++) {
      const sig = sigs[i];
      if (firstAt.get(sig) !== i) continue;               // the same drawing twice in one file (empty pages): once is enough
      const first = decide(sig, i, null, bySig, gone);
      if (first.what === "known") {
        const r = bySig.get(sig);
        if (r.page !== i) { await admin.from("pen_pages").update({ page: i }).match({ user_id: uid, file_id: f.id, sig }); r.page = i; }
        continue;
      }
      if (budget.ms <= 0) { out.done = false; break; }
      const t = performance.now();
      const d = drawPage(doc, i);
      budget.ms -= performance.now() - t;
      const { what, prev } = decide(sig, i, d.ink, bySig, gone);
      const now = new Date().toISOString();
      if (what === "wait") continue;                       // rewritten too often today: looked at again when the file next changes

      if (what === "blank") {
        await admin.from("pen_pages").insert({ user_id: uid, file_id: f.id, sig, page: i, state: "blank", day, ink: d.ink });
        bySig.set(sig, { sig, page: i, state: "blank" });
        continue;
      }
      if (what === "note") {                               // remember the new drawing, leave the entry as it is
        await admin.from("pen_pages").update({ sig, page: i, ink: d.ink, changed_at: now }).match({ user_id: uid, file_id: f.id, sig: prev.sig });
        gone.splice(gone.indexOf(prev), 1); bySig.set(sig, { ...prev, sig, page: i });
        continue;
      }
      const eid = newId();
      if (!(await putPicture(uid, eid, d.jpg))) { out.done = false; out.note = "picture could not be stored"; continue; }
      const img = await sha1([d.jpg]);
      if (what === "new") {
        await admin.from("pen_pages").insert({ user_id: uid, file_id: f.id, sig, page: i, state: "held", entry_id: eid, day, img, ink: d.ink });
        bySig.set(sig, { sig, page: i, state: "held", entry_id: eid });
        out.fresh++;
      } else {                                             // edit: the same page, written on again
        const wasIn = prev.state === "imported";
        if (!wasIn && prev.entry_id) await dropPicture(uid, prev.entry_id);   // a picture nobody has seen yet
        await admin.from("pen_pages").update({
          sig, page: i, state: "held", entry_id: eid, prev_entry: wasIn ? prev.entry_id : prev.prev_entry,
          day: wasIn || prev.state === "held" ? (prev.day || day) : day, img, ink: d.ink,
          revs: (prev.revs || 0) + (wasIn ? 1 : 0), changed_at: now,
        }).match({ user_id: uid, file_id: f.id, sig: prev.sig });
        gone.splice(gone.indexOf(prev), 1); bySig.set(sig, { ...prev, sig, page: i, state: "held", entry_id: eid });
        out.edits++;
      }
    }
  }
}

const entryFor = (r: any, mt: number) => ({
  id: r.entry_id, ts: Date.parse(r.day + "T12:00:00Z") || Date.now(), date: r.day, note: "", archived: true,
  imgHash: r.img, mt, transcription: "", summary: "", mood: "", themes: [], insight: "", status: "queued",
  psync: true, src: "pen",
});

// Put held pages into the journal (live mode only).
async function release(admin: any, uid: string) {
  const out = { added: 0, replaced: 0, waiting: 0, flood: [] as string[] };
  const { data: held } = await admin.from("pen_pages").select("*").eq("user_id", uid).eq("state", "held")
    .order("day", { ascending: true }).order("page", { ascending: true }).limit(400);
  if (!held || !held.length) return out;
  const { data: files } = await admin.from("pen_files").select("file_id,note,tag").eq("user_id", uid);
  const okd = new Set((files || []).filter((f: any) => f.note === "approved").map((f: any) => f.file_id));
  const whole = new Set((files || []).filter((f: any) => !!f.tag).map((f: any) => f.file_id));
  const perFile: Record<string, number> = {};
  for (const r of held) perFile[r.file_id] = (perFile[r.file_id] || 0) + 1;
  const ready = held.filter((r: any) => {
    if (!whole.has(r.file_id)) return false;               // still being read: wait until every page of it is drawn
    if (perFile[r.file_id] > FLOOD && !okd.has(r.file_id)) { if (!out.flood.includes(r.file_id)) out.flood.push(r.file_id); return false; }
    return !!r.entry_id && !!r.day;
  });
  const pick = ready.slice(0, RELEASE_PER_RUN);
  out.waiting = ready.length - pick.length;
  if (!pick.length) return out;
  const now = Date.now();
  const items = pick.map((r: any, k: number) => ({ entry: entryFor(r, now + k), replaces: r.prev_entry || null }));
  const { data: res, error } = await admin.rpc("pen_apply", { uid, items });
  if (error || !res || res.error) throw new Error("journal write failed: " + (error?.message || res?.error || "no reply"));
  for (const r of pick) {
    const got = res[r.entry_id];
    if (!got) continue;
    const state = got === "deleted" ? "deleted" : "imported";
    await admin.from("pen_pages").update({ state, prev_entry: null, changed_at: new Date().toISOString() })
      .match({ user_id: uid, file_id: r.file_id, sig: r.sig });
    if (got === "replaced") { out.replaced++; if (r.prev_entry) await dropPicture(uid, r.prev_entry); }
    else if (got === "added") out.added++;
  }
  return out;
}

// A phone that saved at just the wrong moment can drop a page this worker added.
// Recent pages that have gone missing are put back; ones he deleted stay deleted.
async function reconcile(admin: any, uid: string) {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const { data: rows } = await admin.from("pen_pages").select("file_id,sig,entry_id,readds")
    .eq("user_id", uid).eq("state", "imported").gte("changed_at", since).limit(300);
  const ids = (rows || []).map((r: any) => r.entry_id).filter(Boolean);
  if (!ids.length) return { back: 0, deleted: 0 };
  const { data: miss } = await admin.rpc("pen_missing", { uid, ids });
  let back = 0, deleted = 0;
  for (const r of rows || []) {
    const m = miss?.[r.entry_id];
    if (m === "deleted") { deleted++; await admin.from("pen_pages").update({ state: "deleted" }).match({ user_id: uid, file_id: r.file_id, sig: r.sig }); }
    else if (m === "lost" && (r.readds || 0) < MAX_READDS) {
      back++;
      await admin.from("pen_pages").update({ state: "held", readds: (r.readds || 0) + 1 }).match({ user_id: uid, file_id: r.file_id, sig: r.sig });
    }
  }
  return { back, deleted };
}

async function stateFor(admin: any, uid: string) {
  const { data } = await admin.from("pen_state").select("*").eq("user_id", uid).maybeSingle();
  if (data) return data;
  const fresh = { user_id: uid, live: false, folders: [] };
  await admin.from("pen_state").insert(fresh);
  return fresh;
}

async function tick(admin: any, row: any) {
  const uid = row.user_id, out: any = { user: uid.slice(0, 8) };
  const st: any = await stateFor(admin, uid);
  const tok = await accessToken(admin, row);
  let watch: Watch[] = Array.isArray(st.folders) ? st.folders : [];

  if (!watch.length || !st.looked_at || Date.now() - Date.parse(st.looked_at) > LOOK_EVERY) {
    const found = await discover(tok);
    const have = new Set(watch.map((w) => w.id));
    for (const w of found) if (!have.has(w.id)) { watch.push(w); have.add(w.id); }
    await admin.from("pen_state").update({ folders: watch, looked_at: new Date().toISOString() }).eq("user_id", uid);
  }
  out.watching = watch.length;
  out.live = !!st.live;
  let pending = false;

  if (watch.length) {
    const files = await listFiles(tok, watch);
    const { data: known } = await admin.from("pen_files").select("file_id,tag").eq("user_id", uid);
    const tags = new Map<string, string>((known || []).map((k: any) => [k.file_id, k.tag]));
    const budget = { ms: RENDER_MS };
    out.files = files.length; out.fresh = 0; out.edits = 0; out.settling = 0;
    for (const f of files) {
      if (tags.get(f.id) && tags.get(f.id) === f.cTag) continue;                       // this version is already dealt with
      if (Date.now() - Date.parse(f.lastModifiedDateTime) < SETTLE_MS) { out.settling++; continue; }
      if (budget.ms <= 0) { pending = true; break; }
      const r = await workFile(admin, tok, uid, f, budget);
      out.fresh += r.fresh; out.edits += r.edits;
      if (!r.done) pending = true;
      if (r.note) out.note = r.note;
    }
  }

  if (st.live) {
    out.reconcile = await reconcile(admin, uid);
    out.release = await release(admin, uid);
    if (out.release.waiting) pending = true;
  } else {
    const { count } = await admin.from("pen_pages").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("state", "held");
    out.held = count || 0;
  }
  await admin.from("pen_state").update({ last_run: new Date().toISOString(), last_note: out.note || null }).eq("user_id", uid);
  out.pending = pending;
  return out;
}

// ---------------------------------------------------------------- looking in (scheduler secret only)
async function status(admin: any, uid: string) {
  const st = await stateFor(admin, uid);
  const { data: files } = await admin.from("pen_files").select("file_id,name,pages,modified,tag,note,checked_at").eq("user_id", uid);
  const { data: pages } = await admin.from("pen_pages").select("file_id,page,state,entry_id,prev_entry,day,ink,revs,readds,changed_at")
    .eq("user_id", uid).order("changed_at", { ascending: false }).limit(400);
  const counts: Record<string, number> = {};
  for (const p of pages || []) counts[p.state] = (counts[p.state] || 0) + 1;
  return {
    live: st.live, watching: st.folders, looked_at: st.looked_at, last_run: st.last_run, last_note: st.last_note,
    files: (files || []).map((f: any) => ({ ...f, done: !!f.tag, tag: undefined })), counts,
    pages: (pages || []).slice(0, 60),
  };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();

  // try a file without touching anything: send a PDF or a picture as the body
  if (type === "application/pdf" || type === "image/jpeg" || type === "image/png") {
    const bytes = new Uint8Array(await req.arrayBuffer());
    const doc = mupdf.Document.openDocument(bytes, type);
    const want = new URL(req.url).searchParams.get("page");
    if (want !== null) { const d = drawPage(doc, +want); return new Response(d.jpg, { headers: { "content-type": "image/jpeg" } }); }
    const sigs = await pageSigs(doc);
    const n = Math.min(doc.countPages(), 12), pages: any[] = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now(); const d = drawPage(doc, i);
      pages.push({ i, sig: sigs ? sigs[i].slice(0, 10) : null, w: d.w, h: d.h, bytes: d.jpg.length, ink: +d.ink.toFixed(5), ms: Math.round(performance.now() - t) });
    }
    return Response.json({ pages: doc.countPages(), sigs: sigs ? sigs.map((s) => s.slice(0, 10)) : null, drawn: pages });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  const { data: rows } = await admin.from("ms_auth").select("*");
  const first = rows?.[0];

  if (body.status || body.peek || body.set || body.watch || body.unwatch || body.approve || body.find) {
    if (!first) return Response.json({ error: "OneDrive is not connected" });
    const uid = first.user_id;
    if (body.peek) {                                       // one held or imported page, as a picture
      const img = await fetch(storageUrl(uid, String(body.peek)), { headers: storageHeaders() });
      return new Response(img.body, { status: img.status, headers: { "content-type": img.headers.get("content-type") || "image/jpeg" } });
    }
    if (body.find) return Response.json({ found: await discover(await accessToken(admin, first)) });
    const st = await stateFor(admin, uid);
    if (body.set && typeof body.set.live === "boolean") await admin.from("pen_state").update({ live: body.set.live }).eq("user_id", uid);
    if (body.watch?.id) {
      const w: Watch[] = (st.folders || []).filter((x: Watch) => x.id !== body.watch.id);
      w.push({ id: String(body.watch.id), path: String(body.watch.path || ""), kind: body.watch.kind === "file" ? "file" : "folder", pin: true });
      await admin.from("pen_state").update({ folders: w }).eq("user_id", uid);
    }
    if (body.unwatch) await admin.from("pen_state").update({ folders: (st.folders || []).filter((x: Watch) => x.id !== body.unwatch) }).eq("user_id", uid);
    if (body.approve) await admin.from("pen_files").update({ note: "approved" }).match({ user_id: uid, file_id: String(body.approve) });
    return Response.json(await status(admin, uid));
  }

  const out: any[] = [];
  let pending = false;
  for (const row of rows || []) {
    try { const r = await tick(admin, row); out.push(r); if (r.pending) pending = true; }
    catch (e) {
      const msg = String((e as Error)?.message || e).slice(0, 200);
      out.push({ user: row.user_id.slice(0, 8), error: msg });
      await admin.from("pen_state").update({ last_note: msg, last_run: new Date().toISOString() }).eq("user_id", row.user_id);
    }
  }
  await admin.rpc("pen_pace", { fast: pending });
  return Response.json({ users: out.length, out });
});
