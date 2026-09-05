// Receives health numbers pushed from the phone.
// POST /functions/v1/health-in/<token>
// Accepts either a plain object  {"date":"2026-09-01","weight":186,"bodyfat":23}
// or a Health Auto Export payload {"data":{"metrics":[{"name":"weight_body_mass","data":[{"date":"...","qty":186}]}]}}
//
// Values are parked in health_inbox (one small row per day) and merged into the
// app payload in a single batch by the health-flush cron job. Writing straight
// into the payload meant a multi-megabyte rewrite per POST, which is fine for two
// posts a day and ruinous for a seven-year backfill.
import { createClient } from "npm:@supabase/supabase-js@2";

const KEYS = ["weight","bodyfat","bmi","sleep","steps","rhr","hrv","energy","resp","temp","spo2","protein","fiber","sugar","kcal"];

// Health Auto Export metric names -> ours
const MAP: Record<string, string> = {
  weight_body_mass: "weight", body_mass: "weight", weight: "weight",
  body_fat_percentage: "bodyfat", bodyfat: "bodyfat", body_fat: "bodyfat",
  body_mass_index: "bmi", bmi: "bmi",
  sleep_analysis: "sleep", step_count: "steps", steps: "steps",
  resting_heart_rate: "rhr", heart_rate_variability: "hrv",
  heart_rate_variability_sdnn: "hrv", hrv: "hrv",
  active_energy: "energy", protein: "protein", fiber: "fiber",
  dietary_sugar: "sugar", dietary_energy: "kcal",
  // an Oura ring writes these into Health; a Fitbit never did
  respiratory_rate: "resp", resp: "resp",
  apple_sleeping_wrist_temperature: "temp", wrist_temperature: "temp",
  basal_body_temperature: "temp", body_temperature: "temp", temp: "temp",
  blood_oxygen_saturation: "spo2", oxygen_saturation: "spo2", spo2: "spo2",
};
// sanity bounds — a unit mix-up should leave a gap, not a fake number
const RANGE: Record<string, [number, number]> = {
  sleep: [0.5, 24], steps: [1, 100000], rhr: [25, 140], hrv: [3, 300],
  energy: [1, 10000], weight: [50, 600], bodyfat: [2, 70], bmi: [8, 80],
  resp: [4, 40], temp: [80, 110], spo2: [50, 100],
};

function day(s: any): string {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const pos = (v: any) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// Sleep is the awkward one: which field carries the hours depends on the export
// version and on which app wrote the sleep into Health. Try them all.
function sleepHours(p: any): number | null {
  let h = pos(p.totalSleep) || pos(p.asleep) || pos(p.sleepDuration)
        || (pos(p.core) + pos(p.deep) + pos(p.rem))
        || pos(p.qty) || pos(p.value);
  if (!h) {
    const s = Date.parse(p.sleepStart || p.startDate || p.sleepStartDate || "");
    const e = Date.parse(p.sleepEnd || p.endDate || p.sleepEndDate || "");
    if (s && e && e > s) h = (e - s) / 3600000 - pos(p.awake);
  }
  if (!h) h = pos(p.inBed);                       // last resort
  if (!h) return null;
  if (h > 24) h = h / 60;                         // some versions report minutes
  return h > 0 && h <= 24 ? Math.round(h * 100) / 100 : null;
}

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const log = (ok: boolean, note: string, sample = "") =>
    admin.from("health_log").insert({ ok, note: note.slice(0, 200), sample: sample.slice(0, 700) });

  // tolerate a stray space or newline picked up when the URL was pasted
  let token = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  try { token = decodeURIComponent(token); } catch (_) { /* leave as-is */ }
  token = token.trim().replace(/[^0-9a-zA-Z_-]/g, "");
  if (token.length < 20) { await log(false, "no token in the URL (" + req.method + ")"); return Response.json({ error: "missing token" }, { status: 401, headers: cors }); }

  const { data: row } = await admin.from("health_tokens").select("user_id").eq("token", token).single();
  if (!row) { await log(false, "token not recognised: ..." + token.slice(-6)); return Response.json({ error: "unknown token" }, { status: 401, headers: cors }); }

  let raw = "";
  let body: any = {};
  try { raw = await req.text(); body = JSON.parse(raw); }
  catch (_) { await log(false, "body was not JSON", raw); return Response.json({ error: "send JSON" }, { status: 400, headers: cors }); }

  // day -> { key: value }
  const byDay: Record<string, Record<string, number>> = {};
  const put = (d: string, k: string, v: number | null) => {
    if (v === null) return;
    const r = RANGE[k];
    if (r && (v < r[0] || v > r[1])) return;      // out of range means the unit is wrong; drop it
    (byDay[d] = byDay[d] || {})[k] = v;
  };
  let sleepSample = "";

  const metrics = body?.data?.metrics;
  if (Array.isArray(metrics)) {
    for (const m of metrics) {
      const key = MAP[String(m?.name || "").toLowerCase()];
      if (!key) continue;
      for (const p of (m.data || [])) {
        if (key === "sleep") {
          const h = sleepHours(p);
          if (h === null && !sleepSample) sleepSample = JSON.stringify(p).slice(0, 600);
          put(day(p.date), "sleep", h);
        } else {
          put(day(p.date), key, num(p.qty ?? p.value));
        }
      }
    }
  } else {
    const rows = Array.isArray(body) ? body : [body];
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const d = day(r.date);
      const val = (k: string, v: any) => (k === "sleep" ? sleepHours({ qty: v }) : num(v));
      for (const k of KEYS) if (r[k] != null) put(d, k, val(k, r[k]));
      for (const [rawK, k] of Object.entries(MAP)) if (r[rawK] != null) put(d, k, val(k, r[rawK]));
      if (r.core != null || r.deep != null || r.rem != null || r.totalSleep != null) put(d, "sleep", sleepHours(r));
    }
  }

  const days = Object.keys(byDay);
  if (!days.length) {
    await log(false, "arrived, but no metric names matched", raw);   // keeps a sample so the mapping can be fixed
    return Response.json({ ok: true, days: 0, note: "nothing recognised in that payload" }, { headers: cors });
  }

  // park it — the flush job merges the whole lot into the payload in one write
  const { error: upErr } = await admin.rpc("health_park", { uid: row.user_id, sts: byDay });
  if (upErr) { await log(false, "could not park the values: " + upErr.message, raw); return Response.json({ error: "store failed" }, { status: 500, headers: cors }); }

  const wrote = days.reduce((n, d) => n + Object.keys(byDay[d]).length, 0);
  const keys = [...new Set(days.flatMap((d) => Object.keys(byDay[d])))].join(",");
  // bookkeeping in parallel — a long backfill is thousands of these, so every
  // round trip saved counts
  await Promise.all([
    admin.from("health_tokens").update({ last_post: new Date().toISOString() }).eq("token", token),
    log(true, days.length + " day(s), " + wrote + " values [" + keys + "]: " + days.slice(0, 4).join(", "), sleepSample),
  ]);
  return Response.json({ ok: true, days: days.length, values: wrote, dates: days.slice(0, 5) }, { headers: cors });
});
