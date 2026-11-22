// The way in for pages the Moleskine app backs up to Google Drive.
//
// LifeOS has no Google login of its own. A Zapier workflow in his account, which
// can already read his Drive, calls this in two steps:
//
//   1. POST {"manifest":[{id,name,md5,modified}, …]}   every page file in the backup folder
//      → {"want":[ids]}                                the ones worth sending: his pages, not seen before
//   2. POST {"id","name","md5","modified","b64"}       one wanted page (or the same fields with the file as a form upload)
//
// A page is wanted only if its notebook has a page rule and the page is inside it,
// so the pages the children drew on are never sent, stored or imported. A notebook
// that has no rule yet is noted by name and nothing of it is taken.
//
// pen-tick then draws each page and adds it to the journal like any other.
// The address carries a token (PEN_IN_TOKEN) and is a credential: keep it out of
// reports, logs and messages.
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BYTES = 25e6;
const WAITING = "waiting to be told which pages are his";
const CLAIM_MS = 5 * 60000;

export function bookOf(name: string): { book: string; pageno: number } | null {
  const m = String(name || "").match(/^(.+?)_p(\d{1,4})(?: \(\d+\))?\.pdf$/i);
  return m && +m[2] >= 1 ? { book: m[1].trim(), pageno: +m[2] } : null;
}
export function allowed(rule: any, i: number): boolean {
  const pos = i + 1, within = (rs: any) => Array.isArray(rs) && rs.some((r: any) => pos >= +r[0] && pos <= +r[1]);
  if (!rule) return false;
  if (Array.isArray(rule.only)) return within(rule.only);
  if (Array.isArray(rule.skip)) return !within(rule.skip);
  return true;
}
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
function same(a: string, b: string): boolean {            // compare without leaking where they differ
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const storage = (uid: string, id: string) =>
  `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/pen-inbox/${uid}/${encodeURIComponent(id)}.pdf`;
const storageHeaders = () => ({
  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
});

// the rule of each notebook named in a request, noting any notebook not seen before
async function rulesFor(admin: any, uid: string, books: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const uniq = [...new Set(books)];
  if (!uniq.length) return out;
  const { data } = await admin.from("pen_files").select("file_id,rule").eq("user_id", uid).in("file_id", uniq.map((b) => "book:" + b));
  const have = new Map<string, any>((data || []).map((r: any) => [r.file_id.slice(5), r.rule]));
  for (const b of uniq) {
    if (have.has(b)) out.set(b, have.get(b));
    else { out.set(b, null); await admin.from("pen_files").insert({ user_id: uid, file_id: "book:" + b, name: b.slice(0, 200), src: "inbox", note: WAITING }); }
  }
  return out;
}

Deno.serve(async (req) => {
  const token = decodeURIComponent(new URL(req.url).pathname.split("/").filter(Boolean).pop() || "");
  if (!same(token, Deno.env.get("PEN_IN_TOKEN") || "")) return new Response("not found", { status: 404 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: st } = await admin.from("pen_state").select("user_id").limit(1);
  const uid = st?.[0]?.user_id;
  if (!uid) return Response.json({ error: "the pen importer is not set up" }, { status: 503 });

  // ---- read the request: JSON, or a form with the file attached
  const type = (req.headers.get("content-type") || "").split(";")[0].trim();
  let body: any = {}, bytes: Uint8Array | null = null;
  // what arrived, for the sender's own log when something is refused (never the contents)
  const got = () => ({ type, fields: Object.keys(body).filter((k) => k !== "b64"), file_bytes: bytes ? bytes.length : 0,
    starts: bytes ? String.fromCharCode(...bytes.slice(0, 5)).replace(/[^\x20-\x7e]/g, ".") : "" });
  try {
    if (type === "multipart/form-data") {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") body[k] = v;
        else if (!bytes) bytes = new Uint8Array(await (v as Blob).arrayBuffer());
      }
      // Zapier's webhook sends the named values as one "data" part beside the file
      // (as JSON or as a query string, depending on its "payload type")
      if (typeof body.data === "string") {
        try { Object.assign(body, JSON.parse(body.data)); }
        catch (_) { for (const [k, v] of new URLSearchParams(body.data).entries()) body[k] = v; }
        delete body.data;
      }
      if (typeof body.manifest === "string") body.manifest = JSON.parse(body.manifest);
    } else {
      body = await req.json();
      if (typeof body.manifest === "string") body.manifest = JSON.parse(body.manifest);
      if (typeof body.b64 === "string") {
        const bin = atob(body.b64.replace(/\s+/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      }
    }
  } catch (_) { return Response.json({ stored: false, reason: "could not read the request", got: { type } }); }

  // ---- step 1: which of these files are wanted
  if (Array.isArray(body.manifest)) {
    const files = body.manifest.filter((f: any) => f && f.id && f.name).slice(0, 2000)
      .map((f: any) => ({ id: String(f.id), name: String(f.name), md5: String(f.md5 || ""), modified: String(f.modified || ""), bk: bookOf(String(f.name)) }));
    const pages = files.filter((f: any) => f.bk);
    const rules = await rulesFor(admin, uid, pages.map((f: any) => f.bk.book));
    // the app can leave more than one copy of a page behind: only the latest counts
    const latest = new Map<string, any>();
    for (const f of pages) {
      const k = f.bk.book + "\n" + f.bk.pageno, cur = latest.get(k);
      if (!cur || f.modified > cur.modified) latest.set(k, f);
    }
    const { data: known } = await admin.from("pen_files").select("file_id,inbox_tag,book,pageno,claim,claimed_at").eq("user_id", uid).eq("src", "inbox");
    const seen = new Set((known || []).filter((r: any) => r.inbox_tag).map((r: any) => r.book + "\n" + r.pageno + "\n" + r.inbox_tag));
    // Several runs can ask at once (one starts for every new file). A page promised to
    // one of them is not offered to the others for a few minutes, so it is sent once.
    const promised = new Set((known || []).filter((r: any) => r.claim && r.claimed_at && Date.now() - Date.parse(r.claimed_at) < CLAIM_MS)
      .map((r: any) => r.file_id + "\n" + r.claim));
    const want: any[] = [], waiting = new Set<string>();
    let notHis = 0, have = 0, onTheWay = 0;
    for (const f of latest.values()) {
      const rule = rules.get(f.bk.book);
      if (!rule) { waiting.add(f.bk.book); continue; }
      if (!allowed(rule, f.bk.pageno - 1)) { notHis++; continue; }
      if (f.md5 && seen.has(f.bk.book + "\n" + f.bk.pageno + "\n" + f.md5)) { have++; continue; }
      if (promised.has(f.id + "\n" + (f.md5 || "?"))) { onTheWay++; continue; }
      want.push(f);
    }
    const now = new Date().toISOString(), give = want.slice(0, 40);
    for (const f of give) {
      await admin.from("pen_files").upsert({ user_id: uid, file_id: f.id, name: f.name.slice(0, 200), src: "inbox", book: f.bk.book, pageno: f.bk.pageno,
        claim: f.md5 || "?", claimed_at: now }, { onConflict: "user_id,file_id", ignoreDuplicates: false });
    }
    return Response.json({ want: give.map((f: any) => f.id), more: Math.max(0, want.length - 40), have, on_the_way: onTheWay, outside_rule: notHis, waiting: [...waiting] });
  }

  // ---- step 2: one page
  const id = String(body.id || ""), name = String(body.name || "");
  const bk = bookOf(name);
  if (!id || !bk) return Response.json({ stored: false, reason: "not a notebook page", got: got() });
  const rule = (await rulesFor(admin, uid, [bk.book])).get(bk.book);
  if (!rule) return Response.json({ stored: false, reason: "notebook is waiting for its page rule" });
  if (!allowed(rule, bk.pageno - 1)) return Response.json({ stored: false, reason: "outside the page rule" });
  if (!bytes || !bytes.length) return Response.json({ stored: false, reason: "no file in the request", got: got() });
  if (bytes.length > MAX_BYTES) return Response.json({ stored: false, reason: "too large" });
  if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    return Response.json({ stored: false, reason: "not a PDF", got: got() });
  }
  const tag = /^[0-9a-f]{32}$/i.test(String(body.md5 || "")) ? String(body.md5).toLowerCase() : hex(await crypto.subtle.digest("SHA-1", bytes));

  const { data: mine } = await admin.from("pen_files").select("file_id,inbox_tag").eq("user_id", uid).eq("src", "inbox").eq("book", bk.book).eq("pageno", bk.pageno);
  if ((mine || []).some((r: any) => r.inbox_tag === tag)) return Response.json({ stored: false, reason: "already have it" });

  const up = await fetch(storage(uid, id), {
    method: "POST", headers: { ...storageHeaders(), "content-type": "application/pdf", "x-upsert": "true" }, body: bytes,
  });
  if (!up.ok) return Response.json({ stored: false, reason: "could not be kept" });
  // an older copy of the same page gives way to this one
  for (const r of mine || []) {
    if (r.file_id === id) continue;
    try { await fetch(storage(uid, r.file_id), { method: "DELETE", headers: storageHeaders() }); } catch (_) { /* harmless */ }
    await admin.from("pen_files").delete().match({ user_id: uid, file_id: r.file_id });
  }
  const modified = !isNaN(Date.parse(body.modified || "")) ? new Date(body.modified).toISOString() : new Date().toISOString();
  await admin.from("pen_files").upsert({
    user_id: uid, file_id: id, name: name.slice(0, 200), src: "inbox", book: bk.book, pageno: bk.pageno,
    modified, inbox_tag: tag, checked_at: new Date().toISOString(),
  }, { onConflict: "user_id,file_id", ignoreDuplicates: false });
  await admin.rpc("pen_pace", { fast: true });            // pen-tick looks within two minutes
  return Response.json({ stored: true, page: bk.pageno, bytes: bytes.length });
});
