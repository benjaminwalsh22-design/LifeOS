// Pulls the ring's daily summaries from Oura and parks them for the flush job,
// exactly as Health Auto Export used to. Runs twice a day on cron; ?days=N
// (with the cron secret) backfills. A connection whose synced_through is still
// null (first pull, or just reconnected) backfills 90 days on its own.
//
//   sleep      hours, from the night's long sleep periods (naps excluded)
//   deep, rem  minutes of deep and REM sleep across those periods
//   effic      sleep efficiency, %
//   bed, wake  bedtime and wake time as hours from midnight (23:30 → -0.5, 6:45 → 6.75)
//   hrv        average HRV over the night (ms)
//   rhr        lowest heart rate of the night (bpm) — Oura's resting figure
//   resp       average breaths per minute
//   tdev       skin temperature deviation from baseline (°C)
//   readiness  Oura readiness score 0-100
//   sleepscore Oura sleep score 0-100
//   actscore   Oura activity score 0-100
//   stress     minutes of the day Oura scored as high stress
//   steps, energy (active kcal), spo2 (average %)
//   workout    minutes of workouts that day (ring-detected or logged in the app)
//   gym        minutes of those that were strength / gym work — the November goal counts these
//   meditate   minutes of meditation / breathing sessions logged in the Oura app
// workout, gym and meditate need the workout + session scopes; an older
// connection gets a 401 "not authorized ... scope" there, which is noted, not fatal.
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.ouraring.com/v2/usercollection";
const TOKEN = "https://api.ouraring.com/oauth/token";
const RANGE: Record<string, [number, number]> = {
  sleep: [0.5, 16], deep: [0, 600], rem: [0, 600], effic: [20, 100], bed: [-8, 8], wake: [0, 16],
  hrv: [3, 300], rhr: [25, 140], resp: [4, 40], tdev: [-5, 5],
  readiness: [1, 100], sleepscore: [1, 100], actscore: [1, 100], stress: [0, 1440],
  steps: [1, 100000], energy: [1, 10000], spo2: [50, 100],
  workout: [1, 600], gym: [1, 600], meditate: [1, 600],
};
// Oura activity names that mean "I was at the gym"
const GYM = new Set(["strength_training", "weight_training", "weightlifting", "crossfit", "functional_fitness",
  "hiit", "high_intensity_interval_training", "circuit_training", "core_training", "calisthenics", "kettlebell", "powerlifting"]);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
// local clock time of an ISO stamp with offset, as hours from the midnight the
// night straddles: evening hours come back negative
const clockHours = (s: string | null | undefined, evening: boolean) => {
  const m = /T(\d{2}):(\d{2})/.exec(s || ""); if (!m) return null;
  const h = Number(m[1]) + Number(m[2]) / 60;
  return evening && h >= 12 ? r2(h - 24) : r2(h);
};

async function freshToken(admin: any, row: any) {
  if (row.expires_at - Date.now() > 5 * 60 * 1000) return row.access_token;
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: row.refresh_token,
    client_id: Deno.env.get("OURA_CLIENT_ID")!, client_secret: Deno.env.get("OURA_CLIENT_SECRET")!,
  });
  const res = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const tok = await res.json();
  if (!tok.access_token) throw new Error("refresh failed: " + (tok.error_description || tok.error || res.status));
  // refresh tokens are single-use: store the new pair before anything else can fail
  await admin.from("oura_auth").update({
    access_token: tok.access_token, refresh_token: tok.refresh_token || row.refresh_token,
    expires_at: Date.now() + (tok.expires_in || 86400) * 1000,
  }).eq("user_id", row.user_id);
  return tok.access_token;
}

class Forbidden extends Error {}
async function pull(token: string, path: string, from: string, to: string) {
  const out: any[] = []; let next = "";
  for (let i = 0; i < 20; i++) {
    const u = new URL(API + "/" + path);
    u.searchParams.set("start_date", from); u.searchParams.set("end_date", to);
    if (next) u.searchParams.set("next_token", next);
    const res = await fetch(u, { headers: { Authorization: "Bearer " + token } });
    if (res.status === 403 || (res.status === 401 && /scope/i.test(await res.clone().text()))) throw new Forbidden(path);
    if (!res.ok) throw new Error(path + " " + res.status + " " + (await res.text()).slice(0, 120));
    const j = await res.json();
    out.push(...(j.data || []));
    next = j.next_token || ""; if (!next) break;
  }
  return out;
}
// the collections behind the newer scopes: a 403 means "reconnect", not "broken"
async function pullOptional(token: string, path: string, from: string, to: string, missing: string[]) {
  try { return await pull(token, path, from, to); }
  catch (e) { if (e instanceof Forbidden) { missing.push(path); return []; } throw e; }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const asked = Number(new URL(req.url).searchParams.get("days")) || 0;
  const { data: rows } = await admin.from("oura_auth").select("*");
  if (!rows?.length) return Response.json({ idle: true, note: "no ring connected" });

  const out: any[] = [];
  for (const row of rows) {
    try {
      const token = await freshToken(admin, row);
      const days = Math.min(90, Math.max(1, asked || (row.synced_through ? 3 : 90)));
      const to = new Date(); const from = new Date(to.getTime() - days * 86400000);
      const F = iso(from), T = iso(to);
      const missing: string[] = [];
      const [sleep, dsleep, ready, act, spo2, stress, workouts, sessions] = await Promise.all([
        pull(token, "sleep", F, T), pull(token, "daily_sleep", F, T), pull(token, "daily_readiness", F, T),
        pull(token, "daily_activity", F, T), pull(token, "daily_spo2", F, T), pull(token, "daily_stress", F, T),
        pullOptional(token, "workout", F, T, missing), pullOptional(token, "session", F, T, missing),
      ]);
      const byDay: Record<string, Record<string, number>> = {};
      const put = (d: string, k: string, v: any) => {
        if (!d || v == null || !Number.isFinite(Number(v))) return;
        const n = Number(v), [lo, hi] = RANGE[k];
        if (n < lo || n > hi) return;
        (byDay[d] ||= {})[k] = n;
      };
      // the night's sleep: sum the long periods (a split night is two rows); take
      // hrv / lowest hr / breath / efficiency from the longest one, bedtime from
      // the first, wake time from the last
      const nights: Record<string, any[]> = {};
      for (const s of sleep) if (s.type === "long_sleep" && s.day) (nights[s.day] ||= []).push(s);
      for (const d in nights) {
        const ps = nights[d].slice().sort((a, b) => String(a.bedtime_start).localeCompare(String(b.bedtime_start)));
        const sum = (k: string) => ps.reduce((n, p) => n + (p[k] || 0), 0);
        const main = ps.slice().sort((a, b) => (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0))[0];
        put(d, "sleep", r1(sum("total_sleep_duration") / 3600));
        put(d, "deep", Math.round(sum("deep_sleep_duration") / 60));
        put(d, "rem", Math.round(sum("rem_sleep_duration") / 60));
        put(d, "effic", main.efficiency);
        put(d, "bed", clockHours(ps[0].bedtime_start, true));
        put(d, "wake", clockHours(ps[ps.length - 1].bedtime_end, false));
        put(d, "hrv", main.average_hrv != null ? Math.round(main.average_hrv) : null);
        put(d, "rhr", main.lowest_heart_rate);
        put(d, "resp", main.average_breath != null ? r1(main.average_breath) : null);
      }
      for (const x of dsleep) put(x.day, "sleepscore", x.score);
      for (const x of ready) { put(x.day, "readiness", x.score); put(x.day, "tdev", x.temperature_deviation != null ? r2(x.temperature_deviation) : null); }
      for (const x of act) { put(x.day, "steps", x.steps); put(x.day, "energy", x.active_calories); put(x.day, "actscore", x.score); }
      for (const x of spo2) put(x.day, "spo2", x.spo2_percentage?.average != null ? r1(x.spo2_percentage.average) : null);
      for (const x of stress) if (x.stress_high != null) put(x.day, "stress", Math.round(x.stress_high / 60));
      // workouts: minutes per day, and the strength-type minutes on their own
      const wmin: Record<string, number> = {}, gmin: Record<string, number> = {};
      for (const w of workouts) {
        const d = w.day || String(w.start_datetime || "").slice(0, 10); if (!d) continue;
        const mins = (Date.parse(w.end_datetime) - Date.parse(w.start_datetime)) / 60000;
        if (!Number.isFinite(mins) || mins <= 0) continue;
        wmin[d] = (wmin[d] || 0) + mins;
        if (GYM.has(String(w.activity || "").toLowerCase())) gmin[d] = (gmin[d] || 0) + mins;
      }
      for (const d in wmin) put(d, "workout", Math.round(wmin[d]));
      for (const d in gmin) put(d, "gym", Math.round(gmin[d]));
      const mmin: Record<string, number> = {};
      for (const s of sessions) {
        const d = s.day || String(s.start_datetime || "").slice(0, 10); if (!d) continue;
        const mins = (Date.parse(s.end_datetime) - Date.parse(s.start_datetime)) / 60000;
        if (Number.isFinite(mins) && mins > 0) mmin[d] = (mmin[d] || 0) + mins;
      }
      for (const d in mmin) put(d, "meditate", Math.round(mmin[d]));

      const parked = Object.keys(byDay).length ? await admin.rpc("health_park", { uid: row.user_id, sts: byDay }) : { error: null };
      if (parked.error) throw new Error("park: " + parked.error.message);
      const through = Object.keys(byDay).filter((d) => d < T).sort().pop() || null;
      const note = missing.length ? "Reconnect the ring in Settings to add workouts and sessions." : null;
      await admin.from("oura_auth").update({ last_sync: new Date().toISOString(), last_error: note, synced_through: through }).eq("user_id", row.user_id);
      out.push({ user: row.user_id.slice(0, 8), days: Object.keys(byDay).length, from: F, to: T, missing,
        keys: [...new Set(Object.values(byDay).flatMap((v) => Object.keys(v)))].join(","),
        sample: byDay[through || ""] });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      await admin.from("oura_auth").update({ last_error: msg }).eq("user_id", row.user_id);
      out.push({ user: row.user_id.slice(0, 8), error: msg });
    }
  }
  return Response.json({ ok: true, out });
});
