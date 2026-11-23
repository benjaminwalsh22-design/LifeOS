// Reads journal pages for evidence of his weekly goals: "gym this morning", "dinner out, just us".
//
// Twice an hour it takes the pages transcribed since it last looked (and any that changed), asks
// Claude, one page at a time, which of his weekly actions the page says he actually did and on which day, and keeps
// each finding in goal_evidence with the sentence it rests on. The app counts those days and
// shows the sentence; he can strike any of them. Goals the ring counts by itself (sleep) are left
// to the ring.
//
// Every quotation is checked against the page it claims to come from. One that is not on the page
// is thrown away. A finding the page is ambiguous about is kept but not counted.
//
// A page that is read again (its transcription was corrected, or what counts was reworded) has its
// earlier findings replaced by the new reading.
//
// {"dry":true,"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} reports what would be counted and writes nothing.
// {"goals":[…]} (with or without dry) reads for those goals instead of the ones saved in the app.
import { createClient } from "npm:@supabase/supabase-js@2";

const READER = 2;           // raise when the instructions change, so recent pages are read again
const ABREAST = 4;          // pages read at the same time, one page per call so no page colours another
const PER_TICK = 16;        // pages per run
const LOOKBACK = 30;        // days of pages worth reading
const TZ = "America/Los_Angeles";

const SYSTEM = `You are reading one dated page from a man's handwritten journal to find evidence that he did particular things. You are given a short list of actions, each with an id, and the page with the day it was written.

Report every listed action the page says HE actually did, and the day he did it.

The actions are described in his own words, in the first person: "I" and "my" mean the man who wrote the journal.

Rules:
- Count only things that happened. Not plans, intentions, wishes, things he skipped or says he should do.
- Something another person did without him is never a finding, not even an unsure one.
- A finding is one particular occasion: a session, a class, an evening. A remark that sums up a trip or a stretch of time is not one.
- Work out the day with care. Things told as today's happened on the day the page was written. "Yesterday" and "last night" are the day before. A named weekday is the most recent such day on or before the page's day. When the page tells several days in order ("Friday we… Yesterday we… Today…"), place each thing on its own day.
- At most one finding for an action on a given day.
- Quote the words on the page that show it: copy them exactly, 20 words at most. Never paraphrase and never write a quotation that is not on the page.
- "sure": true when the page plainly shows he did it. "sure": false only when he did something that may well be the action but the page leaves a real doubt (who was there, what kind of session it was).
- If the page shows none of the actions, return [].

Return ONLY a JSON array, no other text:
[{"action":"<action id>","date":"YYYY-MM-DD","quote":"<exact words>","sure":true}]`;

function parseArr(txt: string): any[] {
  try {
    const a = txt.indexOf("["), b = txt.lastIndexOf("]");
    if (a < 0 || b < 0) return [];
    const v = JSON.parse(txt.slice(a, b + 1));
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
// the same words, whatever the spacing, case or punctuation
export const flat = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const dayNum = (d: string) => Math.round(Date.parse(d + "T12:00:00Z") / 86400000);

// the actions to look for: his weekly goals in play, except the ones the ring counts by itself
export function actionsOf(goals: any[]): { id: string; what: string }[] {
  return (goals || []).filter((g: any) => g && g.shape === "weekly" && (g.state || "active") === "active" && g.act && g.act.src !== "sleep7")
    .map((g: any) => ({ id: String(g.id), what: `${String(g.act.what || g.act.label || g.name).slice(0, 300)} (his goal: "${String(g.name).slice(0, 80)}")` }));
}
// What the model reported, reduced to what can be trusted: a known page and action, a day on or
// just before the page's date and not in the future, and a quotation that is really on the page.
// One finding per action per day, the surest first.
export function sift(found: any[], actions: any[], pages: any[], today: string): any[] {
  const byId = new Map<string, any>(pages.map((p: any) => [String(p.id), p]));
  const out: any[] = [];
  for (const f of found || []) {
    const page = byId.get(String(f?.page)), action = actions.find((a) => a.id === f?.action), date = String(f?.date || "");
    if (!page || !action || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const gap = dayNum(String(page.date)) - dayNum(date);
    if (!(gap >= 0 && gap <= 6) || date > today) continue;
    const quote = String(f.quote || "").replace(/\s+/g, " ").trim().slice(0, 240);
    if (!flat(quote) || !flat(page.transcription).includes(flat(quote))) continue;
    out.push({ goal_id: action.id, day: date, quote, entry_id: String(page.id), sure: f.sure !== false });
  }
  const best = new Map<string, any>();
  for (const f of out.sort((a, b) => Number(b.sure) - Number(a.sure))) { const k = f.goal_id + " " + f.day; if (!best.has(k)) best.set(k, f); }
  return [...best.values()].sort((a, b) => a.goal_id.localeCompare(b.goal_id) || a.day.localeCompare(b.day));
}

// What to write after reading some pages again. A finding from a page replaces whatever that page
// gave before, and what the page no longer says is dropped. Against a finding from another page
// for the same day, the sure one stays; between equals, the first.
export function settle(kept: any[], had: any[], pageIds: string[]): { put: any[]; drop: any[] } {
  const key = (f: any) => f.goal_id + " " + String(f.day).slice(0, 10);
  const now = new Set(kept.map(key)), old = new Map<string, any>(had.map((e: any) => [key(e), e]));
  const drop = had.filter((e: any) => pageIds.includes(String(e.entry_id)) && !now.has(key(e)));
  const put = kept.filter((f: any) => { const e = old.get(key(f)); return !e || String(e.entry_id) === f.entry_id || (f.sure && !e.sure); });
  return { put, drop };
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
async function readPage(apiKey: string, actions: any[], page: any): Promise<{ found: any[]; status: number }> {
  const list = actions.map((a) => `- id "${a.id}": ${a.what}`).join("\n");
  const wd = WEEKDAY[new Date(String(page.date) + "T12:00:00Z").getUTCDay()];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: 800, temperature: 0, system: SYSTEM,
      messages: [{ role: "user", content: `Actions:\n${list}\n\nThe page, written on ${wd} ${page.date}:\n\n${String(page.transcription || "").slice(0, 8000)}` }],
    }),
  });
  if (!res.ok) return { found: [], status: res.status };
  const data = await res.json();
  return { found: parseArr((data.content || []).map((c: any) => c.text || "").join("")).map((f: any) => ({ ...f, page: page.id })), status: 200 };
}
// several pages at once, each in its own call; pages whose call failed are named so they are tried again
async function readPages(apiKey: string, actions: any[], pages: any[]): Promise<{ found: any[]; failed: string[] }> {
  const found: any[] = [], failed: string[] = [];
  for (let i = 0; i < pages.length; i += ABREAST) {
    const rs = await Promise.all(pages.slice(i, i + ABREAST).map((p: any) => readPage(apiKey, actions, p).then((r) => ({ p, r })).catch(() => ({ p, r: { found: [], status: 0 } }))));
    for (const { p, r } of rs) { if (r.status === 200) found.push(...r.found); else failed.push(String(p.id)); }
  }
  return { found, failed };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await admin.from("lifeos_data").select("user_id, goals:payload->goals, settings:payload->settings");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const out: any[] = [];

  for (const me of rows || []) {
    const uid = me.user_id, apiKey = me.settings?.apiKey, tag = String(uid).slice(0, 8);
    const actions = actionsOf(Array.isArray(body.goals) ? body.goals : (me.goals || []));
    if (!actions.length) { out.push({ user: tag, idle: "no weekly goals for the journal to count" }); continue; }
    if (!apiKey) { out.push({ user: tag, idle: "no Anthropic key in settings" }); continue; }

    // ---- a report only: nothing is written
    if (body.dry) {
      const { data: pages } = await admin.from("journal_entries").select("id,date,transcription").eq("user_id", uid).eq("status", "done")
        .gte("date", String(body.from || "").slice(0, 10)).lte("date", String(body.to || "").slice(0, 10)).order("date", { ascending: true }).limit(80);
      const readable = (pages || []).filter((p: any) => String(p.transcription || "").trim().length > 20);
      const { found, failed } = await readPages(apiKey, actions, readable);
      const kept = sift(found, actions, readable, today);
      out.push({ user: tag, dry: true, pages_read: readable.length, calls_failed: failed.length, actions, reported: found.length,
        would_count: kept.filter((f) => f.sure), unsure: kept.filter((f) => !f.sure) });
      continue;
    }

    // ---- the pages not yet read for this set of goals (new, changed, or the goals changed)
    const sig = "r" + READER + "|" + actions.map((a: any) => a.id + "=" + a.what).join("|");
    const from = new Date(Date.now() - LOOKBACK * 86400000).toLocaleDateString("en-CA", { timeZone: TZ });
    const { data: recent } = await admin.from("journal_entries").select("id,date,mt").eq("user_id", uid).eq("status", "done")
      .gte("date", from).order("date", { ascending: true }).limit(200);
    const ids = (recent || []).map((p: any) => p.id);
    const { data: seen } = ids.length ? await admin.from("goal_pages").select("entry_id,mt,sig").eq("user_id", uid).in("entry_id", ids) : { data: [] as any[] };
    const was = new Map<string, any>((seen || []).map((s: any) => [s.entry_id, s]));
    const unread = (recent || []).filter((p: any) => { const s = was.get(p.id); return !s || String(s.mt) !== String(p.mt) || s.sig !== sig; });
    const todo = unread.slice(0, PER_TICK);
    if (!todo.length) { out.push({ user: tag, idle: "no new pages" }); continue; }
    const { data: full } = await admin.from("journal_entries").select("id,date,mt,transcription").eq("user_id", uid).in("id", todo.map((p: any) => p.id));
    const pages = (full || []).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));

    const readable = pages.filter((p: any) => String(p.transcription || "").trim().length > 20);
    const { found, failed } = await readPages(apiKey, actions, readable);
    const done = pages.filter((p: any) => !failed.includes(String(p.id)));            // a page whose call failed stays unread
    const kept = sift(found, actions, readable, today);
    const { data: had } = await admin.from("goal_evidence").select("goal_id,day,entry_id,sure").eq("user_id", uid).in("goal_id", actions.map((a: any) => a.id));
    const plan = settle(kept, had || [], done.map((p: any) => String(p.id)));
    for (const f of plan.drop) await admin.from("goal_evidence").delete().eq("user_id", uid).eq("goal_id", f.goal_id).eq("day", f.day);
    if (plan.put.length) await admin.from("goal_evidence").upsert(plan.put.map((f: any) => ({ user_id: uid, ...f })), { onConflict: "user_id,goal_id,day", ignoreDuplicates: false });
    if (done.length) await admin.from("goal_pages").upsert(done.map((p: any) => ({ user_id: uid, entry_id: p.id, mt: p.mt, sig, read_at: new Date().toISOString() })),
      { onConflict: "user_id,entry_id", ignoreDuplicates: false });
    const read = done.length, counted = plan.put.filter((f: any) => f.sure).length, unsure = plan.put.filter((f: any) => !f.sure).length;
    out.push({ user: tag, read, counted, unsure, dropped: plan.drop.length, calls_failed: failed.length, left: unread.length - read });
  }
  return Response.json({ users: out.length, out });
});
