// Indexes OneDrive photos by the date they were taken and caches display copies.
// Cron mode: walk the drive, index metadata only, then pre-cache photos for the 52 Memories.
// On-demand mode: the app asks for one day or month and we cache those now.
import { createClient } from "npm:@supabase/supabase-js@2";

const GRAPH = "https://graph.microsoft.com/v1.0";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const PAGES_PER_RUN = 20;      // delta pages walked per cron tick
const COPY_PER_RUN = 25;      // thumbnails cached per cron tick
const PER_MONTH = 12;         // how many photos a memory month keeps
const PER_DAY = 6;            // how many photos a journal day keeps
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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


// ---- the date is often in the filename even when the metadata has none ----
// 20260221_204320000_iOS.jpg · IMG_20160812_143022.jpg · PXL_20210103_181500.jpg
// IMG-20160812-WA0001.jpg · 2016-08-12 14.30.45.jpg · Screenshot_20200406.png
function dateFromName(name: string): number | null {
  const n = String(name || "");
  const ok = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) => {
    if (y < 2000 || y > new Date().getUTCFullYear() + 1) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const t = Date.UTC(y, mo - 1, d, h, mi, s);
    return isNaN(t) || t > Date.now() + 86400000 ? null : t;
  };
  let m: RegExpMatchArray | null;
  if ((m = n.match(/(20\d{2})(\d{2})(\d{2})[_\-\s](\d{2})(\d{2})(\d{2})/)))
    return ok(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  if ((m = n.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})[ _](\d{2})[.\-](\d{2})[.\-](\d{2})/)))
    return ok(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
  if ((m = n.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/))) return ok(+m[1], +m[2], +m[3]);
  if ((m = n.match(/(?:^|[^\d])(20\d{2})(\d{2})(\d{2})(?:[^\d]|$)/))) return ok(+m[1], +m[2], +m[3]);
  return null;
}

// ---- walk the drive, recording only id + date + size for every photo ----
async function indexDrive(admin: any, row: any, tok: string) {
  let link = row.delta_link ||
    `${GRAPH}/me/drive/root/delta?$select=id,name,file,photo,image,size,deleted&$top=400`;
  let seen = 0, kept = 0, pages = 0, done = false, fromExif = 0, fromName = 0;

  while (pages < PAGES_PER_RUN) {
    const page = await graph(tok, link);
    if (page.error) { await admin.from("ms_auth").update({ last_error: String(page.error.message).slice(0, 200) }).eq("user_id", row.user_id); break; }
    pages++;
    const rows: any[] = [], gone: string[] = [];
    for (const it of page.value || []) {
      seen++;
      if (it.deleted) { gone.push(it.id); continue; }
      const mime = it.file?.mimeType || "";
      if (!mime.startsWith("image/")) continue;
      const exif = it.photo?.takenDateTime ? Date.parse(it.photo.takenDateTime) : NaN;
      const ts = !isNaN(exif) ? exif : dateFromName(it.name);   // metadata first, then the filename
      if (!ts) continue;                          // genuinely no date anywhere
      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      if (!isNaN(exif)) fromExif++; else fromName++;
      rows.push({
        user_id: row.user_id, item_id: it.id, taken: d.toISOString().slice(0, 10),
        taken_ts: d.getTime(), name: String(it.name || "").slice(0, 200),
        w: it.image?.width || null, h: it.image?.height || null, bytes: it.size || null,
      });
      kept++;
    }
    if (rows.length) await admin.from("photo_index").upsert(rows, { onConflict: "user_id,item_id", ignoreDuplicates: false });
    if (gone.length) await admin.from("photo_index").update({ state: "gone" }).eq("user_id", row.user_id).in("item_id", gone);

    if (page["@odata.nextLink"]) { link = page["@odata.nextLink"]; }
    else if (page["@odata.deltaLink"]) { link = page["@odata.deltaLink"]; done = true; break; }
    else { done = true; break; }
  }
  await admin.from("ms_auth").update({ delta_link: link, delta_done: done, last_sync: new Date().toISOString() })
    .eq("user_id", row.user_id);
  return { seen, kept, pages, done, fromExif, fromName };
}

// ---- pull one Graph thumbnail into our own bucket ----
async function cacheOne(admin: any, tok: string, uid: string, itemId: string): Promise<boolean> {
  const t = await graph(tok, `/me/drive/items/${itemId}/thumbnails/0/large`);
  const src = t?.url || t?.value?.[0]?.large?.url;
  if (!src) return false;
  const img = await fetch(src);
  if (!img.ok) return false;
  const buf = new Uint8Array(await img.arrayBuffer());
  if (!buf.length) return false;
  const up = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/life-photos/${uid}/${encodeURIComponent(itemId)}.jpg`,
    { method: "POST", headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        "content-type": "image/jpeg", "x-upsert": "true" }, body: buf },
  );
  if (!up.ok && up.status !== 409) return false;
  await admin.from("photo_index").update({ state: "copied", bytes: buf.length }).eq("user_id", uid).eq("item_id", itemId);
  return true;
}

// ---- decide which indexed photos are worth caching, and cache a budget of them ----
async function cacheBatch(admin: any, row: any, tok: string, budget: number, only?: { day?: string; month?: string }) {
  const { data: targets } = await admin.rpc("photo_targets", { uid: row.user_id });
  const days: Record<string, string> = targets?.days || {};
  const months: string[] = targets?.months || [];
  let copied = 0, matched = 0;

  const want: { from: string; to: string; cap: number; month: boolean }[] = [];
  if (only?.day) want.push({ from: only.day, to: only.day, cap: PER_DAY, month: false });
  else if (only?.month) want.push({ from: only.month + "-01", to: only.month + "-31", cap: PER_MONTH, month: true });
  else for (const m of months) want.push({ from: m + "-01", to: m + "-31", cap: PER_MONTH, month: true });

  for (const w of want) {
    if (copied >= budget) break;
    const { data: pool } = await admin.from("photo_index")
      .select("item_id,taken,state,entry_id")
      .eq("user_id", row.user_id).gte("taken", w.from).lte("taken", w.to)
      .neq("state", "gone").order("taken_ts", { ascending: true }).limit(400);
    if (!pool || !pool.length) continue;

    // spread the cap across the window instead of taking the first N of one morning
    const step = Math.max(1, Math.floor(pool.length / w.cap));
    const pick = pool.filter((_: any, i: number) => i % step === 0).slice(0, w.cap);

    for (const p of pick) {
      if (copied >= budget) break;
      const eid = days[p.taken];
      if (eid && p.entry_id !== eid) {
        await admin.from("photo_index").update({ entry_id: eid }).eq("user_id", row.user_id).eq("item_id", p.item_id);
        matched++;
      }
      if (p.state === "copied") continue;
      if (await cacheOne(admin, tok, row.user_id, p.item_id)) copied++;
      await sleep(80);
    }
  }
  return { copied, matched };
}


// ---- diagnostic: what does the drive actually look like? ----
// Do the photos carry EXIF GPS? If they do, eleven years of locations are already
// sitting in OneDrive and no trip service is needed to know where he was.
async function geoProbe(tok: string) {
  const out: any = { images: 0, withGeo: 0, withDate: 0, samples: [] as any[], years: {} as any };
  let link = `${GRAPH}/me/drive/root/delta?$select=id,name,file,photo,location&$top=400`;
  for (let p = 0; p < 12; p++) {
    const page = await graph(tok, link);
    if (page.error) { out.error = page.error.message; break; }
    for (const it of page.value || []) {
      if (!String(it.file?.mimeType || "").startsWith("image/")) continue;
      out.images++;
      const d = it.photo?.takenDateTime;
      if (d) out.withDate++;
      const g = it.location?.coordinates;
      if (g && g.latitude != null) {
        out.withGeo++;
        const y = d ? String(d).slice(0, 4) : "?";
        out.years[y] = (out.years[y] || 0) + 1;
        if (out.samples.length < 5) out.samples.push({ name: it.name, taken: d, lat: g.latitude, lon: g.longitude });
      }
    }
    if (page["@odata.nextLink"]) link = page["@odata.nextLink"]; else break;
  }
  return out;
}

async function probe(admin: any, row: any, tok: string) {
  const out: any = { byMime: {}, imagesWithDate: 0, imagesNoDate: 0, samples: [] as any[], folders: {} as any };
  let link = `${GRAPH}/me/drive/root/delta?$select=id,name,file,photo,image,size,parentReference&$top=400`;
  for (let p = 0; p < 6; p++) {
    const page = await graph(tok, link);
    if (page.error) { out.error = page.error.message; break; }
    for (const it of page.value || []) {
      const mime = it.file?.mimeType || (it.folder ? "FOLDER" : "other");
      const key = mime.startsWith("image/") ? mime : (mime === "FOLDER" ? "FOLDER" : mime.split("/")[0] || "other");
      out.byMime[key] = (out.byMime[key] || 0) + 1;
      const path = String(it.parentReference?.path || "").replace("/drive/root:", "") || "/";
      if (mime.startsWith("image/")) {
        out.folders[path] = (out.folders[path] || 0) + 1;
        if (it.photo?.takenDateTime) out.imagesWithDate++;
        else { out.imagesNoDate++;
          if (out.samples.length < 6) out.samples.push({ name: it.name, path, photo: it.photo ?? null, size: it.size }); }
      }
    }
    if (page["@odata.nextLink"]) link = page["@odata.nextLink"]; else break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const isCron = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }

  // ---- on-demand: the app asks for one day or month right now ----
  if (!isCron) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u?.user) return new Response("unauthorized", { status: 401, headers: cors });
    const { data: row } = await admin.from("ms_auth").select("*").eq("user_id", u.user.id).single();
    if (!row) return Response.json({ connected: false }, { headers: cors });
    let tok: string;
    try { tok = await accessToken(admin, row); }
    catch (_) { return Response.json({ error: "reconnect" }, { headers: cors }); }
    const only = body.day ? { day: String(body.day).slice(0, 10) }
      : body.month ? { month: String(body.month).slice(0, 7) } : undefined;
    if (!only) return Response.json({ error: "day or month required" }, { headers: cors });
    const r = await cacheBatch(admin, row, tok, 12, only);
    return Response.json({ connected: true, ...r }, { headers: cors });
  }

  // ---- cron: index, then top up the memory-month cache ----
  const { data: rows } = await admin.from("ms_auth").select("*");
  if (body.probe) {
    const r = rows?.[0]; if (!r) return Response.json({ error: "not connected" });
    return Response.json(await probe(admin, r, await accessToken(admin, r)));
  }
  if (body.geo) {
    const r = rows?.[0]; if (!r) return Response.json({ error: "not connected" });
    return Response.json(await geoProbe(await accessToken(admin, r)));
  }
  if (body.tree) {
    const r = rows?.[0]; if (!r) return Response.json({ error: "not connected" });
    const tok = await accessToken(admin, r);
    const path = body.tree === true ? "" : String(body.tree);
    const url = path ? `/me/drive/root:/${path}:/children` : "/me/drive/root/children";
    const kids = await graph(tok, url + "?$top=200&$select=name,folder,file,size,photo");
    if (kids.error) return Response.json({ error: kids.error.message, path });
    const drive = await graph(tok, "/me/drive?$select=quota,name");
    const imgs = (kids.value || []).filter((k: any) => (k.file?.mimeType || "").startsWith("image/"));
    const withDate = imgs.filter((k: any) => k.photo?.takenDateTime);
    return Response.json({
      path: path || "/",
      quota: drive.quota ? { usedGB: +(drive.quota.used / 1e9).toFixed(1), totalGB: +(drive.quota.total / 1e9).toFixed(1) } : null,
      imageSample: { images: imgs.length, withExifDate: withDate.length,
        examples: imgs.slice(0, 3).map((k: any) => ({ name: k.name, taken: k.photo?.takenDateTime ?? null })) },
      items: (kids.value || []).map((k: any) => ({
        name: k.name,
        kind: k.folder ? "folder" : (k.file?.mimeType || "file"),
        children: k.folder?.childCount ?? undefined,
        sizeGB: k.size > 1e8 ? +(k.size / 1e9).toFixed(2) : undefined,
      })).sort((a: any, b: any) => (b.children || 0) - (a.children || 0)).slice(0, 40),
    });
  }
  const out: any[] = [];
  for (const row of rows || []) {
    let tok: string;
    try { tok = await accessToken(admin, row); }
    catch (_) { out.push({ user: row.user_id.slice(0, 8), error: "reconnect needed" }); continue; }
    const idx = row.delta_done ? { seen: 0, kept: 0, pages: 0, done: true } : await indexDrive(admin, row, tok);
    // crawl hard only while there is still drive to walk
    await admin.rpc("photo_pace", { fast: !idx.done });
    const cache = await cacheBatch(admin, row, tok, COPY_PER_RUN);
    const { count } = await admin.from("photo_index").select("*", { count: "exact", head: true }).eq("user_id", row.user_id);
    out.push({ user: row.user_id.slice(0, 8), indexed: count, ...idx, ...cache });
  }
  return Response.json({ users: out.length, out });
});
