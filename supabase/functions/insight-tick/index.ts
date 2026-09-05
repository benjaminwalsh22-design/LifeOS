// Reads the joined digest and asks Claude what it sees. The digest carries
// counts, means and correlations only — no journal text ever leaves the database.
import { createClient } from "npm:@supabase/supabase-js@2";

const SYSTEM = `You are reading a statistical digest of one man's life: his money, his mood (scored 1-10 from a journal he has kept daily since 2015), his body, and his travel. Benjamin is a 34-year-old M&A lawyer in Southern California who runs his own firm, married, with three young children. He built this system himself and he is not fragile — he wants the truth, including the boring truth.

Write observations that only someone looking at ALL of this at once could make. The point of the system is that money, mood, sleep and travel finally sit in one place; an observation about one of them alone is usually not worth the space.

HARD RULES
- Every number you write must appear in the digest. Never estimate, never round to a different figure, never infer a number you were not given.
- Correlations under |0.15| are nothing. Say so plainly when it matters; do not dress them up.
- Watch the sample sizes in the digest. "nights: 3" means three nights of sleep data, and nothing about sleep can be concluded from it. Say the data is missing instead of pretending it isn't.
- No advice unless the data supports a specific action. No wellness filler. Never tell him to sleep more, meditate, or practise gratitude.
- Comparing the last 30 days to the previous 30, or to his all-time baseline, is usually the most useful move.
- The digest now carries his firm's own daily numbers: hours worked, billable hours, amount billed, alongside the mood scores for the same days. This is the join the whole system was built for. But links.hours_days says how many days actually have both — under 20 and there is nothing to say yet beyond how the collection is going. Say that plainly rather than reading a correlation off five days.
- work.last_narrative is the firm's own account of what the work was. Use it for context on a hard or good stretch; never quote it back at him verbatim as if it were an insight.
- NEVER characterise a ratio between two numbers — no "double", "half", "three times", "an order of magnitude". State both figures and let him do the comparing. $10,196 against $9,520 is not "nearly double"; it is $10,196 against $9,520.
- A direction word must survive being checked. If you write that something rose, exceeded, or beat something else, verify the two numbers actually say that before you write it. 7.12 does not exceed 7.21.
- Before returning, re-read every sentence against the digest and delete any claim you cannot point to.

ALREADY ESTABLISHED — do not present these as new findings, though you may build on them:
- Across 3,759 days, daily discretionary spending has essentially no relationship to that day's mood (r = +0.01). There is no retail therapy here.
- Days with a meal out score +0.25 happiness (6.57 vs 6.32, p<0.0001).
- Months with a tax payment run noticeably more anxious (anxiety 4.06 vs 3.67).
- Sleep and anxiety move independently for him.
- Income roughly tripled 2020-2022 while happiness fell; 2026 is the happiest year on record.
- Hours worked ran at r = -0.24 against happiness across 144 days he hand-tracked in 2024. Suggestive, never confirmed. The daily firm reports are what will settle it.

Return ONLY a JSON array, 3 to 5 objects, most interesting first:
[{"kind":"money|mood|body|travel|link","title":"one sentence, specific, no hedging","body":"2-3 sentences with the actual figures and what they do or don't mean","strength":"strong|moderate|thin"}]
"strength" is your honest read of how much weight the evidence carries. Use "thin" freely — an observation worth making on weak evidence is fine as long as it is labelled.`;

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: row } = await admin.from("lifeos_data").select("user_id, payload").limit(1).single();
  if (!row) return Response.json({ error: "no account" });
  const key = row.payload?.settings?.apiKey;
  if (!key) return Response.json({ error: "no api key on the account" });

  const { data: digest, error } = await admin.rpc("life_digest", { p_uid: row.user_id });
  if (error) return Response.json({ error: "digest: " + error.message });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-sonnet-4-5", max_tokens: 1600, system: SYSTEM,
      messages: [{ role: "user", content: "Today is " + digest.as_of + ".\n\n" + JSON.stringify(digest, null, 1) }],
    }),
  });
  if (!res.ok) return Response.json({ error: "api " + res.status, detail: (await res.text()).slice(0, 200) });
  const data = await res.json();
  const txt = (data.content || []).map((c: any) => c.text || "").join("");

  let items: any[] = [];
  try {
    const a = txt.indexOf("["), b = txt.lastIndexOf("]");
    if (a >= 0 && b > a) items = JSON.parse(txt.slice(a, b + 1));
  } catch (_) { /* fall through */ }
  items = items.filter(o => o && o.title && o.body).slice(0, 5);
  if (!items.length) return Response.json({ error: "nothing parseable back", sample: txt.slice(0, 300) });

  // Second pass, adversarial. The first draft has been caught claiming one number
  // was double another when it was 7% larger, and that 7.12 exceeded 7.21. A model
  // checking arithmetic with fresh eyes catches what the writing pass talked itself into.
  const CHECK = `You are fact-checking observations written from the digest below. For each one, test EVERY number and EVERY comparison against the digest.
- A figure that does not appear in the digest, and cannot be derived from it by simple subtraction, is wrong.
- A comparison must hold arithmetically. "A exceeds B" where A < B is wrong. Ratio words ("double", "twice") are wrong unless the arithmetic supports them exactly.
- Sample sizes matter: a claim resting on a handful of days is wrong if stated confidently.
Return ONLY the JSON array, same shape and order, with unsupported claims rewritten to what the digest actually says, or the whole item dropped if nothing survives. Change nothing that checks out — keep the original wording where it is correct.`;
  let checked = items;
  try {
    const v = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5", max_tokens: 1600, system: CHECK,
        messages: [{ role: "user", content: "DIGEST:\n" + JSON.stringify(digest) +
          "\n\nOBSERVATIONS:\n" + JSON.stringify(items) }],
      }),
    });
    if (v.ok) {
      const vt = ((await v.json()).content || []).map((c: any) => c.text || "").join("");
      const a2 = vt.indexOf("["), b2 = vt.lastIndexOf("]");
      if (a2 >= 0 && b2 > a2) {
        const parsed = JSON.parse(vt.slice(a2, b2 + 1));
        if (Array.isArray(parsed) && parsed.length) checked = parsed.filter((o: any) => o && o.title && o.body);
      }
    }
  } catch (_) { /* keep the unchecked draft rather than nothing */ }
  const dropped = items.length - checked.length;
  items = checked;

  const { error: insErr } = await admin.from("insights").insert({
    user_id: row.user_id,
    items,
    digest,
    model: "claude-sonnet-4-5",
  });
  if (insErr) return Response.json({ error: "could not store: " + insErr.message });
  // keep a month of history, no more
  await admin.from("insights").delete().eq("user_id", row.user_id)
    .lt("at", new Date(Date.now() - 31 * 86400000).toISOString());

  return Response.json({ ok: true, n: items.length, dropped, titles: items.map(o => o.title) });
});
