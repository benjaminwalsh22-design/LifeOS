// Scores each journal entry for happiness and anxiety on the same 1-10 scale
// the daily check-ins use, so the two can share a chart.
import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH = 10;        // entries per Claude call — they calibrate against each other
const BATCHES = 3;       // calls per tick
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RUBRIC = `You are reading pages from one man's handwritten journal, kept daily since 2015. For each entry, judge how the DAY ITSELF felt to him from what he wrote. You are not grading the writing, and not judging whether he *should* feel a certain way.

HAPPINESS, 1-10 — the overall emotional tone of the day as lived:
 1-2  despair, grief, a genuinely bad day; loss, fear, feeling broken
 3-4  low, discouraged, heavy, drained, lonely, defeated
 5    flat or genuinely mixed — good and bad in equal measure, or an ordinary day he felt neutral about
 6-7  good: content, satisfied, steady, quiet pleasure, a solid day
 8-9  joyful, proud, moved, delighted, celebratory
 10   rare peaks — a wedding, a birth, the best days of a life

ANXIETY, 1-10 — how much worry, dread or pressure the day carried:
 1-2  calm, settled, nothing weighing on him
 3-4  mild background stress, ordinary deadlines
 5-6  noticeable worry he keeps returning to
 7-8  significant anxiety, dread, a real threat to work/health/family
 9-10 acute distress, crisis, panic

Rules that matter:
- Reflective or philosophical writing is NOT sad. A calm, thoughtful entry about an ordinary day is roughly happiness 6, anxiety 2-3.
- A hard day handled well is still a hard day: score how it felt, not how maturely he wrote about it.
- Anger and frustration lower happiness but only raise anxiety when there is worry about an outcome.
- Work stress he is on top of is anxiety 4-5, not 8.
- Most days in most lives are 5-7. Use the extremes sparingly and mean them.
- Judge only the day described. Do not let one dramatic sentence swing an otherwise ordinary day.

Return ONLY a JSON array, one object per entry, in the order given, no other text:
[{"id":"<the exact id>","hap":<1-10 integer>,"anx":<1-10 integer>}]`;

function parseArr(txt: string): any[] {
  try {
    const a = txt.indexOf("["), b = txt.lastIndexOf("]");
    if (a < 0 || b < 0) return [];
    const v = JSON.parse(txt.slice(a, b + 1));
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
const clamp = (n: any) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(10, Math.max(1, v)) : null;
};

async function scoreBatch(apiKey: string, rows: any[]): Promise<Map<string, any>> {
  const body = rows.map((r) =>
    `--- id: ${r.entry_id} (${r.entry_date}) ---\n${String(r.txt || "").slice(0, 4500)}`
  ).join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: 900, system: RUBRIC,
      messages: [{ role: "user", content: `Score these ${rows.length} entries.\n\n${body}` }],
    }),
  });
  if (!res.ok) throw new Error("api " + res.status);
  const data = await res.json();
  const txt = (data.content || []).map((c: any) => c.text || "").join("");
  const out = new Map<string, any>();
  for (const o of parseArr(txt)) {
    const hap = clamp(o.hap), anx = clamp(o.anx);
    if (o.id && hap && anx) out.set(String(o.id), { hap, anx });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // cheap first: trigger-maintained counter, so an idle tick never opens the payload
  const { data: flags } = await admin.rpc("work_flags");
  if (flags?.[0] && Number(flags[0].unscored) === 0) {
    await admin.rpc("score_pace", { fast: false });
    return Response.json({ idle: true, cheap: true });
  }

  let done = 0, missed = 0, calls = 0, err = "";
  for (let b = 0; b < BATCHES; b++) {
    const { data: rows, error } = await admin.rpc("unscored_pages", { lim: BATCH });
    if (error) { err = error.message; break; }
    if (!rows || !rows.length) {                       // caught up: stand down to hourly
      await admin.rpc("score_pace", { fast: false });
      const { data: s } = await admin.rpc("score_stats");
      return Response.json({ idle: true, done, ...(s?.[0] ?? {}) });
    }
    if (!rows[0].api_key) return Response.json({ error: "no api key on the account" });

    let scores: Map<string, any>;
    try { scores = await scoreBatch(rows[0].api_key, rows); calls++; }
    catch (e) { err = String(e).slice(0, 120); break; }

    const patch: Record<string, any> = {};
    const now = Date.now();
    for (const r of rows) {
      const s = scores.get(r.entry_id);
      if (s) { patch[r.entry_id] = { ...s, mt: now }; done++; }
      else   { patch[r.entry_id] = { hap: 0, anx: 0, mt: now }; missed++; }  // 0 = couldn't score, never retried
    }
    await admin.rpc("apply_scores", { uid: rows[0].user_id, scores: patch });
    await sleep(400);
  }
  if (done) await admin.rpc("score_pace", { fast: true });
  const { data: s } = await admin.rpc("score_stats");
  return Response.json({ done, missed, calls, err: err || undefined, ...(s?.[0] ?? {}) });
});
