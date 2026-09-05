// Ask Ben — a coach in two voices, built from the journal.
//
// POST /functions/v1/ask-ben   (user JWT in Authorization)
//   { question, voice: both|past|future, depth: deep|quick, session_id? }
// Streams Server-Sent Events:
//   event: session   data: { session_id }
//   event: tool      data: { line }                 one grey log line
//   event: delta     data: { t }                    answer text as it arrives
//   event: done      data: { turn_id, markdown, sources, unverified }
//   event: error     data: { message }
//
// The distilled index lives in coach_index (private) and is sent as a cached
// system prompt. Quotes the model produces are checked against the strings it
// was actually given before the final markdown is stored or shown.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const API = "https://api.anthropic.com/v1/messages";
const DEEP_MODEL  = Deno.env.get("ASK_BEN_DEEP_MODEL")  || "claude-sonnet-4-5";
const QUICK_MODEL = Deno.env.get("ASK_BEN_QUICK_MODEL") || "claude-haiku-4-5";
const MEMORY_TURNS = 4;
const MAX_SEARCH = 3, MAX_READ = 2, MAX_ROUNDS = 8;

// ------------------------------------------------------------------ prompt
const PROMPT = `You are a coach for one person, Benjamin Walsh ("Ben"), built entirely from his own daily journal: {{COUNT}} entries from {{SPAN}}, distilled into the INDEX below. He is 34, a solo M&A attorney in Newbury Park, married to Annalise for ten years, father of Reagan (7), Gianna (4) and William (2). He asked for this. Speak to him, not about him.

TWO VOICES
- Past Ben: what he has already written, learned, and lived through. Second person ("you wrote", "you did this in 2021"). Every claim traces to a date. Quotes are verbatim only, taken from INDEX quotes or from read_entry results; never paraphrase inside quotation marks and never invent a quote.
- Future Ben: the person he is becoming, defined in INDEX.future_ben. First person ("I"). On his side, not a scold. Grounded in what the record proves he can do.
{{VOICE_RULE}}

HOW TO ANSWER
- Read the situation. Decide which of these it is: a fight brewing, a spiral, a decision, a pattern check, work eating everything, a flat landing after a win, grief or family crisis. Use INDEX.hard_moment_playbook and INDEX.loops for that case. Name the loop by its name if one fits.
- Be specific and direct. No platitudes, no "it's important to remember". He journals daily; he knows the generic advice. What he cannot see is his own record. Show him the pattern with dates.
- If it is a decision, apply INDEX.future_ben.the_test explicitly and run it against INDEX.decision_history.
- If he is spiraling, lead with the two or three things that have actually helped him before (with dates), then the future voice, short.
- Match his register: plain, a little wry, no therapy-speak. See INDEX.voice_guide. Do not diagnose or label him with conditions.
- Length: 250-450 words total unless he asks for more. Short paragraphs. Use a blockquote for any verbatim quote, with the date after it in the form (2019-03-04).
{{TOOL_RULE}}
- Keep tool calls few: one get_index call can take several ids at once.
- End with "## Sources": a bullet list of the dated entries you relied on, each as "YYYY-MM-DD · short label · entry:ENTRY_ID", where ENTRY_ID is the entry_id given in the INDEX or returned by a tool. Only list entries that appear in the INDEX or came back from tools. Three to six items.

FORMAT (markdown only, exactly these H2 headings, nothing before the first heading):
## From the record
## From the Ben you're becoming
## Sources

INDEX (JSON):
{{INDEX_JSON}}`;

const VOICE_RULE: Record<string, string> = {
  both:   `Answer in both voices, in this order: "## From the record" then "## From the Ben you're becoming".`,
  past:   `Answer ONLY as Past Ben: the section "## From the record". Omit the Future Ben section.`,
  future: `Answer ONLY as Future Ben: the section "## From the Ben you're becoming". Omit the record section, but still ground it in dated evidence.`,
};
const TOOL_RULE: Record<string, string> = {
  deep:  `- You may call search_journal (up to ${MAX_SEARCH} times) and read_entry (up to ${MAX_READ} times) when the situation involves a specific person, place, event or year, or when you want his exact words from an entry not in the index. Prefer the INDEX for patterns; use the journal tools for specifics. Use get_index to pull exact quotes before quoting.`,
  quick: `- Journal search is off in this mode; work from the INDEX and get_index only, and say so in one clause if a specific search would have helped.`,
};
// Appended to both tool rules. Smaller models like to announce the tool call
// ("Let me look that up") and then forget the headings altogether.
const NO_NARRATION = `
- Never narrate what you are about to do. Call tools silently. Your reply text begins with the first heading and contains nothing before it.`;

export function pickRules(voice: string, depth: string) {
  return {
    voice: VOICE_RULE[voice] ?? VOICE_RULE.both,
    tool:  (TOOL_RULE[depth] ?? TOOL_RULE.deep) + NO_NARRATION,
  };
}

const TOOLS: any[] = [
  { name: "get_index",
    description: "Pull exact items from the INDEX by id or key, mainly to quote verbatim. Sections: lessons (ids like L02), loops (ids), playbook (case key), future_ben (key, or 'answers'), decisions (by index), voice, year (key like 2019).",
    input_schema: { type: "object", properties: {
      section: { type: "string", enum: ["lessons","loops","playbook","future_ben","decisions","voice","year"] },
      ids: { type: "array", items: { type: "string" } },
      key: { type: "string" } }, required: ["section"] } },
  { name: "search_journal",
    description: "Full-text search over every journal entry. Returns up to 14 of {entry_id, date, mood, summary}. Use for a specific person, place, event or year.",
    input_schema: { type: "object", properties: {
      query: { type: "string" }, year: { type: "integer" }, limit: { type: "integer" } }, required: ["query"] } },
  { name: "read_entry",
    description: "Read one entry in full: {date, mood, themes, transcript}. Use when you want his exact words.",
    input_schema: { type: "object", properties: { entry_id: { type: "string" } }, required: ["entry_id"] } },
];

// ------------------------------------------------------------------ index
type Index = { wisdom: any; future: any; voice: any[]; compact: string; quotes: string[] };
let INDEX: Index | null = null;
let INDEX_AT = 0;

function collectQuotes(x: any, out: string[]) {
  if (Array.isArray(x)) { for (const v of x) collectQuotes(v, out); return; }
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) {
      if (k === "quote" && typeof v === "string") out.push(v);
      else collectQuotes(v, out);
    }
  }
}
async function loadIndex(admin: any): Promise<Index> {
  if (INDEX && Date.now() - INDEX_AT < 10 * 60_000) return INDEX;
  const { data, error } = await admin.from("coach_index").select("key, body")
    .in("key", ["wisdom_index", "future_ben", "voice_pool"]);
  if (error || !data?.length) throw new Error("index not loaded: " + (error?.message ?? "empty"));
  const by: Record<string, any> = Object.fromEntries(data.map((r: any) => [r.key, r.body]));
  const wisdom = by.wisdom_index, future = by.future_ben, voice = by.voice_pool ?? [];
  // the compact index: everything, with per-loop evidence trimmed to three
  const compact = JSON.parse(JSON.stringify(wisdom));
  for (const l of compact.loops ?? []) if (Array.isArray(l.evidence)) l.evidence = l.evidence.slice(0, 3);
  compact.future_ben = future;
  const quotes: string[] = [];
  collectQuotes(wisdom, quotes); collectQuotes(future, quotes); collectQuotes(voice, quotes);
  INDEX = { wisdom, future, voice, compact: JSON.stringify(compact), quotes };
  INDEX_AT = Date.now();
  return INDEX;
}

// ------------------------------------------------------------------ tools
function cleanTranscript(t: string) {
  return String(t || "").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 6000);
}
async function runTool(name: string, input: any, ctx: { admin: any; uid: string; idx: Index; depth: string;
                        counts: { search: number; read: number }; seen: string[]; log: string[] }) {
  const { admin, uid, idx } = ctx;
  if (name === "get_index") {
    const w = idx.wisdom, f = idx.future, ids: string[] = input.ids ?? [];
    ctx.log.push("index: " + [input.section, ...(ids.length ? ids : input.key ? [input.key] : [])].join(" "));
    switch (input.section) {
      case "lessons":   return (w.core_lessons ?? []).filter((l: any) => !ids.length || ids.includes(l.id));
      case "loops":     return (w.loops ?? []).filter((l: any) => !ids.length || ids.includes(l.id));
      case "playbook":  return input.key ? (w.hard_moment_playbook?.[input.key] ?? null) : w.hard_moment_playbook;
      case "future_ben": return input.key === "answers" ? f.how_future_ben_answers_present_ben
                         : input.key ? (f[input.key] ?? null) : f;
      case "decisions": return w.decision_history ?? [];
      case "voice":     return w.voice_guide ?? {};
      case "year":      return input.key ? (w.year_index?.[input.key] ?? null) : w.year_index;
      default:          return { error: "unknown section" };
    }
  }
  if (name === "search_journal") {
    if (ctx.depth !== "deep") return { error: "search is off in Quick mode" };
    if (ctx.counts.search >= MAX_SEARCH) return { error: `search limit (${MAX_SEARCH}) reached` };
    ctx.counts.search++;
    ctx.log.push("searching: " + String(input.query).slice(0, 60));
    const { data, error } = await admin.rpc("search_entries", {
      p_uid: uid, query: String(input.query), year: input.year ?? null, lim: Math.min(14, input.limit ?? 10) });
    if (error) return { error: error.message };
    return (data ?? []).map((r: any) => ({ entry_id: r.id, date: r.date, mood: r.mood, summary: r.summary }));
  }
  if (name === "read_entry") {
    if (ctx.depth !== "deep") return { error: "reading entries is off in Quick mode" };
    if (ctx.counts.read >= MAX_READ) return { error: `read limit (${MAX_READ}) reached` };
    ctx.counts.read++;
    ctx.log.push("reading an entry");
    const { data } = await admin.from("journal_entries")
      .select("date, mood, themes, transcription").eq("user_id", uid).eq("id", String(input.entry_id)).maybeSingle();
    if (!data) return { error: "no such entry" };
    const transcript = cleanTranscript(data.transcription);
    ctx.seen.push(transcript);                  // now quotable
    return { entry_id: input.entry_id, date: data.date, mood: data.mood, themes: data.themes, transcript };
  }
  return { error: "unknown tool" };
}

// ------------------------------------------------------------------ verification
const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’`]/g, "").replace(/…/g, "...")
  .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// A blockquote passes if a meaningful run of it (the whole thing, or a long
// fragment — the model may trim) appears in something it was actually given.
function quoteOk(text: string, pool: string[]) {
  const q = norm(text.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, ""));
  if (q.length < 12) return true;                          // too short to mean anything
  if (pool.some(p => p.includes(q) || (q.length > 40 && q.includes(p) && p.length > 40))) return true;
  // the model may quote a clipped sentence: accept any run of 8+ words that appears
  const words = q.split(" ");
  if (words.length >= 8) {
    for (let n = words.length - 1; n >= 8; n--)
      for (let i = 0; i + n <= words.length; i++)
        if (pool.some(p => p.includes(words.slice(i, i + n).join(" ")))) return true;
  }
  return false;
}
const UNV = " *(unverified — not found in the record)*";

// Two shapes of quote: a blockquote line, and a run of 6+ words inside quotation
// marks in ordinary prose. Both must trace to something the model was given.
export function verifyQuotes(markdown: string, allowed: string[]) {
  const pool = allowed.map(norm);
  let unverified = 0;
  const out = markdown.split("\n").map(line => {
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      if (quoteOk(bq[1], pool)) return line;
      unverified++; return bq[1] + UNV;
    }
    if (/^##\s/.test(line)) return line;
    // inline: a quoted span is only a citation when the prose presents it as one —
    // "you wrote …", "in 2022: …", or a date right after. A suggested text to send,
    // or his own words echoed back from the question, are not claims about the record.
    return line.replace(/[“"]([^“”"]{20,}?)[”"]/g, (m, inner, offset) => {
      if (inner.trim().split(/\s+/).length < 6) return m;
      const before = line.slice(Math.max(0, offset - 90), offset);
      const after  = line.slice(offset + m.length, offset + m.length + 16);
      const attributed = /\b(wrote|writing|written|said|noted|recorded|journal(?:ed)?|entry|in (?:19|20)\d{2}|(?:19|20)\d{2}:)\b[^“”"]*$/i.test(before)
                      || /^\s*\(\d{4}-\d{2}-\d{2}\)/.test(after);
      if (!attributed) return m;
      if (quoteOk(inner, pool)) return m;
      unverified++; return m + UNV;
    });
  }).join("\n");
  return { markdown: out, unverified };
}

// The format rule says nothing before the first heading; smaller models still
// add a warm-up sentence, and it lands glued to the heading. Cut it.
export function trimPreamble(markdown: string) {
  // un-glue first, so the first heading can be found wherever it landed
  const fixed = markdown.replace(/([^\n])(## )/g, "$1\n\n$2");
  const i = fixed.search(/(^|\n)## /);
  if (i < 0) return fixed.trim();
  return fixed.slice(i).trim();
}

// The two-voice format is the feature. A reply that lacks the headings the
// voice setting calls for is sent back once to be rewritten — the client and
// the stored turn only ever see the repaired version.
export function formatOk(markdown: string, voice: string) {
  const rec = /(^|\n)## From the record\b/.test(markdown);
  const fut = /(^|\n)## From the Ben you're becoming\b/i.test(markdown);
  if (voice === "past") return rec;
  if (voice === "future") return fut;
  return rec && fut;
}

// ------------------------------------------------------------------ citations
export function parseSources(markdown: string) {
  const i = markdown.indexOf("## Sources");
  if (i < 0) return [] as { date: string; label: string; entry_id: string | null }[];
  const block = markdown.slice(i);
  const out: { date: string; label: string; entry_id: string | null }[] = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*[-*]\s*(\d{4}-\d{2}-\d{2})\s*[·•\-–|]\s*(.+?)\s*(?:[·•\-–|]\s*)?(?:entry:|\[entry\]\(entry:)?([a-z0-9]{10,24})?\)?\s*$/i);
    if (!m) continue;
    let label = m[2].replace(/\s*[·•\-–|]\s*$/, "").trim();
    label = label.replace(/\s*entry:[a-z0-9]+\s*$/i, "").trim();
    out.push({ date: m[1], label: label.slice(0, 80), entry_id: m[3] ? m[3].toLowerCase() : null });
  }
  return out.slice(0, 8);
}

// ------------------------------------------------------------------ streaming call
async function* anthropicStream(key: string, body: any) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error("api " + res.status + ": " + (await res.text()).slice(0, 200));
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const dl = chunk.split("\n").find(l => l.startsWith("data:"));
      if (!dl) continue;
      try { yield JSON.parse(dl.slice(5)); } catch (_) { /* keepalive */ }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- who is asking
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  if (ue || !u?.user) return new Response("unauthorized", { status: 401, headers: CORS });
  const uid = u.user.id;

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }
  const question = String(body.question ?? "").trim();
  const voice = ["both", "past", "future"].includes(body.voice) ? body.voice : "both";
  const depth = ["deep", "quick"].includes(body.depth) ? body.depth : "deep";
  if (!question) return Response.json({ error: "ask something" }, { status: 400, headers: CORS });

  const { data: acct } = await admin.from("lifeos_data").select("payload").eq("user_id", uid).single();
  const key = acct?.payload?.settings?.apiKey;
  if (!key) return Response.json({ error: "no API key in Settings" }, { status: 400, headers: CORS });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctl) {
      const send = (ev: string, data: any) => ctl.enqueue(enc.encode(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const idx = await loadIndex(admin);
        const { count } = await admin.from("journal_entries").select("id", { count: "exact", head: true }).eq("user_id", uid);
        const { data: span } = await admin.from("journal_entries").select("date").eq("user_id", uid)
          .not("date", "is", null).order("date", { ascending: true }).limit(1);
        const first = span?.[0]?.date ?? "2015-07-17";
        const mon = (d: string) => new Date(d + "T12:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
        const today = new Date().toISOString().slice(0, 10);
        const rules = pickRules(voice, depth);
        const system = PROMPT
          .replace("{{COUNT}}", (count ?? 0).toLocaleString("en-US"))
          .replace("{{SPAN}}", mon(first) + " to " + mon(today))
          .replace("{{VOICE_RULE}}", rules.voice)
          .replace("{{TOOL_RULE}}", rules.tool)
          .replace("{{INDEX_JSON}}", idx.compact);

        // ---- session and memory
        let sessionId: number = Number(body.session_id) || 0;
        if (sessionId) {
          const { data: s } = await admin.from("coach_sessions").select("id").eq("id", sessionId).eq("user_id", uid).maybeSingle();
          if (!s) sessionId = 0;
        }
        if (!sessionId) {
          const { data: s, error: se } = await admin.from("coach_sessions")
            .insert({ user_id: uid, first_question: question.slice(0, 200) }).select("id").single();
          if (se || !s) throw new Error("could not start a session: " + (se?.message ?? "no row"));
          sessionId = s.id;
        }
        send("session", { session_id: sessionId });
        const { data: prior } = await admin.from("coach_turns").select("question, answer_markdown")
          .eq("session_id", sessionId).order("asked_at", { ascending: false }).limit(MEMORY_TURNS);
        const messages: any[] = [];
        for (const t of (prior ?? []).reverse()) {
          if (!t.answer_markdown) continue;
          messages.push({ role: "user", content: t.question });
          messages.push({ role: "assistant", content: t.answer_markdown });
        }
        messages.push({ role: "user", content: `BEN, NOW (${today}):\n${question}` });

        const model = depth === "deep" ? DEEP_MODEL : QUICK_MODEL;
        const tools = depth === "deep" ? TOOLS : TOOLS.filter(t => t.name === "get_index");
        const ctx = { admin, uid, idx, depth, counts: { search: 0, read: 0 }, seen: [] as string[], log: [] as string[] };
        let answer = "";

        // ---- the tool loop, streaming text as it comes
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const blocks: any[] = [];          // assistant content for this round
          let cur: any = null; let stop = "";
          for await (const ev of anthropicStream(key, {
            model, max_tokens: 2000, tools,
            system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
            messages,
          })) {
            if (ev.type === "content_block_start") {
              cur = ev.content_block.type === "tool_use"
                ? { type: "tool_use", id: ev.content_block.id, name: ev.content_block.name, _json: "" }
                : { type: "text", text: "" };
            } else if (ev.type === "content_block_delta") {
              if (ev.delta.type === "text_delta") { cur.text += ev.delta.text; answer += ev.delta.text; send("delta", { t: ev.delta.text }); }
              else if (ev.delta.type === "input_json_delta") cur._json += ev.delta.partial_json;
            } else if (ev.type === "content_block_stop") {
              if (cur?.type === "tool_use") { try { cur.input = JSON.parse(cur._json || "{}"); } catch (_) { cur.input = {}; } delete cur._json; }
              blocks.push(cur); cur = null;
            } else if (ev.type === "message_delta") {
              stop = ev.delta?.stop_reason ?? stop;
            } else if (ev.type === "error") {
              throw new Error(ev.error?.message ?? "stream error");
            }
          }
          messages.push({ role: "assistant", content: blocks });
          if (stop !== "tool_use") break;
          const results: any[] = [];
          for (const b of blocks.filter(x => x.type === "tool_use")) {
            const before = ctx.log.length;
            const out = await runTool(b.name, b.input ?? {}, ctx);
            for (const line of ctx.log.slice(before)) send("tool", { line });
            results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out).slice(0, 30000) });
          }
          messages.push({ role: "user", content: results });
        }

        // ---- enforce the format mechanically
        let draft = trimPreamble(answer);
        if (!formatOk(draft, voice)) {
          ctx.log.push("reformatting"); send("tool", { line: "reformatting" });
          const fix = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model, max_tokens: 2000, tools, tool_choice: { type: "none" },   // earlier turns carry tool blocks
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              messages: [...messages, { role: "user", content:
                "That reply was not in the required format. Rewrite it now, complete, in the exact format the rules call for: " +
                rules.voice + " Begin with the first heading; no text before it; no narration about tools. " +
                "Keep every quote verbatim and every date as it was. Do not add claims you did not already make. End with \"## Sources\"." }],
            }),
          });
          if (fix.ok) {
            const j = await fix.json();
            const txt = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
            if (formatOk(trimPreamble(txt), voice)) draft = trimPreamble(txt);
          }
        }

        // ---- check the quotes, parse the sources, keep the turn
        const { markdown, unverified } = verifyQuotes(draft, [...idx.quotes, ...ctx.seen]);
        const sources = parseSources(markdown);
        const { data: turn } = await admin.from("coach_turns").insert({
          session_id: sessionId, user_id: uid, question, answer_markdown: markdown,
          voice, depth, model, sources, tool_log: ctx.log, unverified,
        }).select("id").single();
        await admin.from("coach_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
        send("done", { turn_id: turn?.id, session_id: sessionId, markdown, sources, unverified, model });
      } catch (e) {
        send("error", { message: String((e as Error)?.message ?? e).slice(0, 300) });
      }
      ctl.close();
    },
  });
  return new Response(stream, { headers: { ...CORS, "content-type": "text/event-stream", "cache-control": "no-cache" } });
});
