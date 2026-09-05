import { createClient } from "npm:@supabase/supabase-js@2";

const NOTION = "https://api.notion.com/v1";
const DB_ID = "a5922de0f10a4b0c924957633981dd8f";
const NV = "2022-06-28";
const PER_RUN = 40;
const SCAN_TTL = 315360000; // 10 years
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function nh() {
  return { "Authorization": "Bearer " + Deno.env.get("NOTION_TOKEN"), "Notion-Version": NV, "Content-Type": "application/json" };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nfetch(path: string, opts: any = {}, tries = 3): Promise<any> {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(NOTION + path, { ...opts, headers: nh() });
    if (res.status === 429 || res.status >= 500) { await sleep(1200 * (i + 1)); continue; }
    return await res.json();
  }
  return { object: "error", message: "retries exhausted" };
}

function rt(text: string) { return [{ type: "text", text: { content: text.slice(0, 1900) } }]; }
function chunks(text: string): any[] {
  const out: any[] = [];
  for (const para of String(text).split(/\n\n+/)) {
    let p = para.trim(); if (!p) continue;
    while (p.length) {
      out.push({ object: "block", type: "paragraph", paragraph: { rich_text: rt(p.slice(0, 1900)) } });
      p = p.slice(1900);
    }
    if (out.length > 90) break;
  }
  return out;
}

// ---- readable titles: whole sentence, or a clause, never a mid-thought chop ----
function fmtTitle(e: any) {
  let d = "Undated";
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) {
    const [y, m, day] = e.date.split("-").map(Number);
    d = MON[m - 1] + " " + day + ", " + y;
  }
  const src = String(e.summary || e.transcription || "").replace(/\s+/g, " ").trim();
  if (!src) return d;
  let s = "";
  const sent = src.match(/^[^.!?]{12,88}[.!?]/);            // a complete short sentence
  if (sent) s = sent[0].replace(/[.!?]+$/, "");
  else {
    let cut = -1;                                           // else stop at a clause break
    for (let i = 28; i < Math.min(src.length, 92); i++) {
      if (!",;:—–".includes(src[i])) continue;
      if (/\d/.test(src[i - 1] || "") && /\d/.test(src[i + 1] || "")) continue;  // 10,000
      cut = i; break;
    }
    if (cut > 0) s = src.slice(0, cut);
    else if (src.length <= 88) s = src;
    else s = src.slice(0, 84).replace(/\s+\S*$/, "") + "…";
  }
  s = s.trim().replace(/[\s,;:—–]+$/, "");
  return s ? d + " — " + s : d;
}

// ---- transcription confidence + review flags (mirrors the app) ----
const MARKRE = /\[\?\]|\[illegible\]|\[unclear\]|\[unreadable\]/gi;
const MONNUM: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
function dwParts(dw: string): number[] | null {
  const t = String(dw || "").toLowerCase(); if (!t.trim()) return null;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})/))) return [MONNUM[m[1]], +m[2]];
  if ((m = t.match(/(\d{1,2})[\/\-.](\d{1,2})/))) return [+m[1], +m[2]];
  return null;
}
function reviewOf(e: any): { conf: number; why: string[] } {
  const t = String(e.transcription || "").trim();
  const w = (t.match(/\S+/g) || []).length;
  const m = (t.match(MARKRE) || []).length;
  const conf = w ? Math.max(0, 1 - m / w) : 0;
  const why: string[] = [];
  if (!t) why.push("no transcription");
  else {
    if (w >= 15 && m / w > 0.01) why.push(m + " unreadable word" + (m === 1 ? "" : "s"));
    if (w < 120) why.push("unusually short for a full page");
  }
  const p = dwParts(e.dw);
  if (p && p[0] >= 1 && p[0] <= 12 && p[1] >= 1 && p[1] <= 31 && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) {
    const d = e.date.split("-").map(Number);
    if (p[0] !== d[1] || p[1] !== d[2]) why.push('page reads "' + String(e.dw).trim() + '"');
  }
  return { conf, why };
}

async function signScan(uid: string, eid: string): Promise<string> {
  try {
    const base = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${base}/storage/v1/object/sign/journal-photos/${uid}/${encodeURIComponent(eid)}.jpg`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ expiresIn: SCAN_TTL }),
    });
    if (!res.ok) return "";
    const j = await res.json();
    return j.signedURL ? base + "/storage/v1" + j.signedURL : "";
  } catch (_) { return ""; }
}

function props(e: any, scan: string) {
  const r = reviewOf(e);
  const p: any = {
    "Entry": { title: rt(fmtTitle(e)) },
    "Summary": { rich_text: rt(e.summary || "") },
    "Mood": { rich_text: rt(e.mood || "") },
    "Insight": { rich_text: rt(e.insight || "") },
    "Archived": { checkbox: !!e.archived },
    "LifeOS ID": { rich_text: rt(e.id) },
    "Synced MT": { number: e.mt || 0 },
    "Confidence": { number: Math.round(r.conf * 1000) / 1000 },
    "Needs review": { checkbox: r.why.length > 0 },
    "Date on page": { rich_text: rt(String(e.dw || "").trim()) },
  };
  if (scan) p["Scan"] = { url: scan };
  if (/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) p["Date"] = { date: { start: e.date } };
  const themes = (e.themes || []).filter((t: any) => t && typeof t === "string")
    .map((t: string) => ({ name: t.replace(/,/g, " ").trim().slice(0, 90) })).filter((t: any) => t.name).slice(0, 10);
  if (themes.length) p["Themes"] = { multi_select: themes };
  return p;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // only entries that are new or edited since their last backup — never the whole payload
  const { data: pending, error } = await admin.rpc("notion_pending", { lim: PER_RUN });
  if (error) return Response.json({ error: error.message });
  if (!pending || !pending.length) {
    // caught up: drop back to the every-6-hours pace
    const { data: pace } = await admin.rpc("notion_pace", { fast: false });
    const twy = await syncTwy(admin);
    return Response.json({ idle: true, pace, twy });
  }
  if (pending.length >= PER_RUN) await admin.rpc("notion_pace", { fast: true }); // a real backlog: run every 5 min

  let created = 0, updated = 0, failed = 0, scans = 0, flagged = 0;
  for (const row of pending) {
    const e = row.entry;
    const scan = e.psync === false ? "" : await signScan(row.user_id, e.id);
    if (scan) scans++;
    if (reviewOf(e).why.length) flagged++;

    const body = chunks(e.transcription || "");
    if (e.note) body.push({ object: "block", type: "callout", callout: { rich_text: rt("Note: " + e.note), icon: { emoji: "✏️" } } });
    const withScan = scan
      ? [{ object: "block", type: "image", image: { type: "external", external: { url: scan } } }, ...body]
      : body;

    if (row.page_id) { // edited since last backup: retire the old page, write a fresh one
      await nfetch(`/pages/${row.page_id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
      await sleep(250);
    }
    const payload = (kids: any[]) => JSON.stringify({
      parent: { database_id: DB_ID }, properties: props(e, scan), children: kids.slice(0, 95),
    });
    let res = await nfetch(`/pages`, { method: "POST", body: payload(withScan) });
    if (res.object !== "page" && scan) { // an image block Notion won't take shouldn't cost us the page
      await sleep(250);
      res = await nfetch(`/pages`, { method: "POST", body: payload(body) });
    }
    if (res.object === "page") {
      await admin.from("notion_synced").upsert({
        entry_id: e.id, page_id: res.id, mt: e.mt || 0, user_id: row.user_id,
      }, { onConflict: "entry_id" });
      row.page_id ? updated++ : created++;
    } else { failed++; }
    await sleep(250);
  }
  const twy = await syncTwy(admin);
  const { data: stats } = await admin.rpc("notion_stats");
  return Response.json({ created, updated, failed, scans, flagged, pending: stats?.[0]?.pending ?? null, total: stats?.[0]?.total ?? null, twy });
});

// ---- 12 Week Year scoreboard sync ----
const TWY_DB = "d5c314d4a56a43fd917d5e40b7a03835";
const TWY_PROPS: Record<string, string> = {
  A: "A · Sleep 7h+, 5 of 7", B: "B · Ben gym 2x", C: "C · Protein + fiber 5x", D: "D · Sugar cap 5x",
  E: "E · Date night", F: "F · Sunday sync", G: "G · Appreciation 6 of 7", H: "H · Friend touch",
  I: "I · Meditate 6 of 7", J: "J · No alcohol",
};
async function syncTwy(admin: any): Promise<any> {
  const { data: rows } = await admin.rpc("twy_state");
  const t = rows?.[0]?.twy;
  if (!t || !t.weeks || !t.tactics) return "no plan";
  const { data: synced } = await admin.from("twy_synced").select("*");
  const sMap = new Map<number, any>((synced || []).map((s: any) => [s.wk, s]));
  let pushed = 0, out: any = null;
  for (let n = 1; n <= 12; n++) {
    const w = t.weeks["w" + n];
    if (!w || !Object.keys(w.c || {}).length) continue;
    const prev = sMap.get(n);
    if (prev && (w.mt || 0) <= (prev.mt || 0)) continue;
    const start = new Date(Date.parse(t.start + "T12:00:00Z") + (n - 1) * 7 * 86400000);
    const end = new Date(start.getTime() + 6 * 86400000);
    const hits = t.tactics.filter((x: any) => (w.c[x.k] || 0) >= x.t).length;
    const props: any = {
      "Dates": { date: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) } },
      "Score": { number: Math.round(hits / t.tactics.length * 100) / 100 },
      "Phase": { select: { name: n <= 11 ? "Build" : "Hold the line" } },
      "What happened": { rich_text: [{ type: "text", text: { content: String(w.note || "").slice(0, 1900) } }] },
      "Line missed": { rich_text: [{ type: "text", text: { content: t.tactics.filter((x: any) => (w.c[x.k] || 0) < x.t).map((x: any) => x.k).join(", ").slice(0, 200) } }] },
    };
    if (typeof w.slp === "number") props["Sleep avg (h)"] = { number: w.slp };
    for (const k of Object.keys(TWY_PROPS)) {
      const tac = t.tactics.find((x: any) => x.k === k);
      props[TWY_PROPS[k]] = { checkbox: !!tac && (w.c[k] || 0) >= tac.t };
    }
    let pageId = prev?.page_id;
    if (!pageId) { // find or create the Week N row
      const q = await nfetch(`/databases/${TWY_DB}/query`, { method: "POST", body: JSON.stringify({
        filter: { property: "Week", title: { starts_with: "Week " + n } }, page_size: 5 }) });
      if (q.object === "error" || q.code) { out = "scoreboard not connected"; break; }
      const exact = (q.results || []).find((pg: any) => {
        const tt = (pg.properties?.["Week"]?.title || []).map((r: any) => r.plain_text).join("");
        return tt === "Week " + n || tt.startsWith("Week " + n + " ");
      });
      pageId = exact?.id;
    }
    const res = pageId
      ? await nfetch(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ properties: props }) })
      : await nfetch(`/pages`, { method: "POST", body: JSON.stringify({ parent: { database_id: TWY_DB },
          properties: { ...props, "Week": { title: [{ type: "text", text: { content: "Week " + n } }] } } }) });
    if (res.object === "page") {
      await admin.from("twy_synced").upsert({ wk: n, mt: w.mt || 0, page_id: res.id }, { onConflict: "wk" });
      pushed++;
    } else { out = "row " + n + ": " + (res.message || "error").slice(0, 80); }
    await sleep(300);
  }
  return out || (pushed ? pushed + " weeks synced" : "up to date");
}
