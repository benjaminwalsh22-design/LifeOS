import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const APP_URL = "https://benjaminwalsh22-design.github.io/LifeOS/";
const PER_TICK = 4;
const JSON_SHAPE = '{"date_written":"the date exactly as it appears written on the page, VERBATIM (e.g. \'July 16\' or \'3/2\' or \'Dec 1, 2019\'). Do NOT add a year that is not written. Empty string if no date appears.","transcription":"a faithful line-by-line transcription of exactly what is written; use [?] where truly unreadable; never paraphrase, never invent plausible-sounding content","summary":"1-2 sentence summary","mood":"1-3 words","themes":["up to 4 short topic tags"],"insight":"one brief, kind, useful observation"}';

const MONNUM: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
function parseWritten(dw: string, expStr: string): string | null {
  if (!dw) return null;
  const t = dw.toLowerCase();
  let m = 0, d = 0, y = 0, mm: RegExpMatchArray | null;
  if ((mm = t.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/))) {
    m = MONNUM[mm[1]]; d = +mm[2]; y = mm[3] ? +mm[3] : 0;
  } else if ((mm = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    y = +mm[1]; m = +mm[2]; d = +mm[3];
  } else if ((mm = t.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/))) {
    m = +mm[1]; d = +mm[2]; y = mm[3] ? (+mm[3] < 100 ? 2000 + +mm[3] : +mm[3]) : 0;
  }
  if (!m || !d || m > 12 || d > 31) return null;
  if (y >= 1990 && y <= 2100) {
    const c = Date.UTC(y, m - 1, d); return isNaN(c) ? null : new Date(c).toISOString().slice(0, 10);
  }
  const exp = Date.parse(expStr + "T12:00:00Z");
  if (isNaN(exp)) return null;
  let best = 0, bd = Infinity;
  for (const yy of [new Date(exp).getUTCFullYear() - 1, new Date(exp).getUTCFullYear(), new Date(exp).getUTCFullYear() + 1]) {
    const c = Date.UTC(yy, m - 1, d);
    const delta = Math.abs(c - exp) / 86400000;
    if (delta < bd) { bd = delta; best = c; }
  }
  if (!best || bd > 60) return null;
  return new Date(best).toISOString().slice(0, 10);
}

function parseJson(txt: string): any {
  try { return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch (_) { return null; }
}

async function callVision(apiKey: string, b64: string, text: string): Promise<{ status: number; txt: string; refused: boolean }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-opus-4-5", max_tokens: 3500,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b64 } },
        { type: "text", text },
      ]}],
    }),
  });
  if (!res.ok) return { status: res.status, txt: "", refused: false };
  const data = await res.json();
  const txt = (data.content || []).map((c: any) => c.text || "").join("");
  const refused = data.stop_reason === "refusal" || (!txt.trim() && !!data.stop_reason);
  return { status: 200, txt, refused };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // cheap first: a counter table kept current by a trigger, so an idle tick
  // never has to open the multi-megabyte payload
  const { data: flags } = await admin.rpc("work_flags");
  if (flags?.[0] && Number(flags[0].queued) === 0) {
    await admin.rpc("transcribe_pace", { fast: false });
    return Response.json({ idle: true, cheap: true });
  }

  const { data: pages, error } = await admin.rpc("queued_pages2", { lim: PER_TICK });
  if (error) return Response.json({ error: error.message });
  if (!pages || !pages.length) {                 // nothing waiting: drop back to every 15 min
    await admin.rpc("transcribe_pace", { fast: false });
    return Response.json({ idle: true });
  }
  await admin.rpc("transcribe_pace", { fast: true });   // work to do: back to every minute

  const summary: any[] = [];
  const doneByUser: Record<string, number> = {};
  let remainingLast = -1;
  const skipUser = new Set<string>();

  for (const pg of pages) {
    if (skipUser.has(pg.user_id)) continue;
    if (!pg.api_key) { summary.push({ id: pg.entry_id.slice(0, 6), skip: "no api key" }); skipUser.add(pg.user_id); continue; }

    const dl = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/journal-photos/${pg.user_id}/${encodeURIComponent(pg.entry_id)}.jpg`,
      { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! } },
    );
    if (!dl.ok) { summary.push({ id: pg.entry_id.slice(0, 6), skip: "photo missing" }); continue; }
    const buf = new Uint8Array(await dl.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const b64 = btoa(bin);

    // ---- pass 1: transcribe with personal context ----
    const ctx =
      "CONTEXT to help you read this handwriting (the author's world):\n" +
      (pg.lex ? "Names, places, and terms that appear often in this journal: " + pg.lex + "\n" : "") +
      "This page is from approximately " + (pg.entry_date || "an unknown date") + ".\n" +
      (pg.prev_tail ? "The previous day's entry ended: “…" + pg.prev_tail + "”\n" : "") +
      "Use this context to resolve hard-to-read words — a scrawl that could be several words is probably the one that fits the author's life. Never invent content that isn't on the page.\n\n" +
      "This is a photo of one handwritten personal journal page. Return ONLY a JSON object with these keys: " + JSON_SHAPE;

    const p1 = await callVision(pg.api_key, b64, ctx);
    if (p1.status === 429 || p1.status >= 500 || p1.status === 529) { summary.push({ id: pg.entry_id.slice(0, 6), retry: p1.status }); skipUser.add(pg.user_id); continue; }
    if (p1.status === 401 || p1.status === 403) {
      await admin.rpc("apply_page", { uid: pg.user_id, eid: pg.entry_id, patch: { status: "error", mt: Date.now() } });
      summary.push({ id: pg.entry_id.slice(0, 6), err: p1.status }); skipUser.add(pg.user_id); continue;
    }
    if (p1.refused) {
      await admin.rpc("apply_page", { uid: pg.user_id, eid: pg.entry_id, patch: { status: "error", refused: true, mt: Date.now() } });
      summary.push({ id: pg.entry_id.slice(0, 6), refused: true }); continue;
    }
    const parsed = parseJson(p1.txt);

    let patch: any;
    if (parsed) {
      const pd = parseWritten(String(parsed.date_written || parsed.date || ""), pg.entry_date);
      const date = pd || pg.entry_date;
      patch = {
        date, ts: Date.parse(date + "T12:00:00Z") || Date.now(),
        transcription: parsed.transcription || "", summary: parsed.summary || "",
        mood: parsed.mood || "", themes: Array.isArray(parsed.themes) ? parsed.themes : [],
        insight: parsed.insight || "", status: "done", mt: Date.now(),
        dw: String(parsed.date_written || "").slice(0, 40), rt: 3,
      };
    } else if (p1.txt.trim().length > 40) {
      patch = { transcription: p1.txt.trim(), summary: "", status: "done", mt: Date.now(), rt: 3 };
    } else {
      patch = { status: "error", mt: Date.now() };
    }
    summary.push({ id: pg.entry_id.slice(0, 6), ok: patch.status });

    const { data: rem } = await admin.rpc("apply_page", { uid: pg.user_id, eid: pg.entry_id, patch });
    if (typeof rem === "number") remainingLast = rem;
    if (patch.status === "done") doneByUser[pg.user_id] = (doneByUser[pg.user_id] || 0) + 1;
  }

  if (remainingLast === 0) {
    for (const uid of Object.keys(doneByUser)) {
      try {
        const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false });
        const appServer = await webpush.ApplicationServer.new({ contactInformation: "mailto:benjamin.walsh22@gmail.com", vapidKeys });
        const { data: subs } = await admin.from("push_subs").select("*").eq("user_id", uid);
        for (const s of subs || []) {
          try {
            await appServer.subscribe(s.sub).pushTextMessage(JSON.stringify({
              title: "Archive ready", body: "Cloud transcription finished — your journal is up to date.", url: APP_URL,
            }), {});
          } catch (_) { /* fine */ }
        }
      } catch (_) { /* push optional */ }
    }
  }
  return Response.json({ summary, remaining: remainingLast });
});
