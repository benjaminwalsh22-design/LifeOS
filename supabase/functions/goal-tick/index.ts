// Reads journal pages for evidence of his weekly goals: "gym this morning", "dinner out, just us".
//
// For now this only REPORTS. Called with {"dry":true,"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} and the
// scheduler secret, it returns what it would count and the sentence each count rests on, and writes
// nothing. Counting for real waits until he has looked at a test run and said yes.
//
// Every quotation is checked against the page it claims to come from; one that is not on the page
// is marked so and would not be counted.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 8;            // pages per Claude call
const MAX_PAGES = 80;

const SYSTEM = `You are reading dated pages from one man's handwritten journal to find evidence that he did particular things. You are given a short list of actions, each with an id, and a set of pages, each with an id and the date it was written.

For each page, report every listed action the page says HE actually did, and the day he did it.

Rules:
- Count only things that happened. Not plans, intentions, wishes, things he skipped, things he says he should do, or things someone else did.
- The day is the page's own date, unless the page clearly places it on another day ("yesterday", "last night", a named weekday or date). Then give that day.
- At most one finding for an action on a given day.
- Quote the words on the page that show it: copy them exactly, 20 words at most. Never paraphrase and never write a quotation that is not on the page.
- If the page is ambiguous about whether it counts, include it with "sure": false. If it plainly counts, "sure": true.
- If a page shows none of the actions, report nothing for it.

Return ONLY a JSON array, no other text:
[{"page":"<page id>","action":"<action id>","date":"YYYY-MM-DD","quote":"<exact words>","sure":true}]`;

function parseArr(txt: string): any[] {
  try {
    const a = txt.indexOf("["), b = txt.lastIndexOf("]");
    if (a < 0 || b < 0) return [];
    const v = JSON.parse(txt.slice(a, b + 1));
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
// the same words, whatever the spacing, case or punctuation
const flat = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function readBatch(apiKey: string, actions: any[], pages: any[]): Promise<{ found: any[]; status: number }> {
  const list = actions.map((a) => `- id "${a.id}": ${a.what}`).join("\n");
  const body = pages.map((p) => `--- page ${p.id}, written ${p.date} ---\n${String(p.transcription || "").slice(0, 5000)}`).join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: 1500, system: SYSTEM,
      messages: [{ role: "user", content: `Actions:\n${list}\n\nPages:\n\n${body}` }],
    }),
  });
  if (!res.ok) return { found: [], status: res.status };
  const data = await res.json();
  return { found: parseArr((data.content || []).map((c: any) => c.text || "").join("")), status: 200 };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  if (!body.dry) return Response.json({ note: "goal-tick only reports for now: call it with dry:true" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await admin.from("lifeos_data").select("user_id, goals:payload->goals, settings:payload->settings").limit(1);
  const me = rows?.[0];
  if (!me) return Response.json({ error: "no data" });
  const apiKey = me.settings?.apiKey;
  if (!apiKey) return Response.json({ error: "no Anthropic key in settings" });

  // the actions to look for: given in the call, or his weekly goals that are not counted by the ring
  const actions: any[] = Array.isArray(body.actions) && body.actions.length ? body.actions
    : (me.goals || []).filter((g: any) => g.shape === "weekly" && (g.state || "active") === "active" && g.act && g.act.src !== "sleep7")
      .map((g: any) => ({ id: g.id, what: `${g.act.label || g.name} (for his goal "${g.name}")` }));
  if (!actions.length) return Response.json({ error: "no weekly goals to look for" });

  const from = String(body.from || "").slice(0, 10), to = String(body.to || "").slice(0, 10);
  const { data: pages, error } = await admin.from("journal_entries").select("id,date,transcription")
    .eq("user_id", me.user_id).eq("status", "done").gte("date", from).lte("date", to).order("date", { ascending: true }).limit(MAX_PAGES);
  if (error) return Response.json({ error: error.message });
  const readable = (pages || []).filter((p: any) => String(p.transcription || "").trim().length > 20);
  const byId = new Map<string, any>(readable.map((p: any) => [p.id, p]));

  const found: any[] = []; let failed = 0;
  for (let i = 0; i < readable.length; i += BATCH) {
    const r = await readBatch(apiKey, actions, readable.slice(i, i + BATCH));
    if (r.status !== 200) { failed++; continue; }
    for (const f of r.found) {
      const page = byId.get(String(f.page)), action = actions.find((a) => a.id === f.action);
      if (!page || !action || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || ""))) continue;
      const quote = String(f.quote || "").slice(0, 240);
      found.push({
        action: action.id, date: f.date, page_date: page.date, quote, sure: f.sure !== false,
        on_the_page: flat(quote).length > 0 && flat(page.transcription).includes(flat(quote)),
      });
    }
  }
  // one count per action per day; the surest, verified finding wins
  const best = new Map<string, any>();
  for (const f of found.sort((a, b) => Number(b.on_the_page) - Number(a.on_the_page) || Number(b.sure) - Number(a.sure))) {
    const k = f.action + " " + f.date; if (!best.has(k)) best.set(k, f);
  }
  const out = [...best.values()].sort((a, b) => a.action.localeCompare(b.action) || a.date.localeCompare(b.date));
  return Response.json({
    dry: true, from, to, pages_read: readable.length, calls_failed: failed, actions,
    would_count: out.filter((f) => f.on_the_page && f.sure), unsure: out.filter((f) => f.on_the_page && !f.sure),
    not_on_the_page: out.filter((f) => !f.on_the_page),
  });
});
