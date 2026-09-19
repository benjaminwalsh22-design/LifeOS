// Pulls the ring's daily summaries from Oura and parks them for the flush job,
// exactly as Health Auto Export used to. Runs twice a day on cron; ?days=N
// (with the cron secret) backfills.
//
//   sleep      hours, from the night's long sleep periods (naps excluded)
//   hrv        average HRV over the night (ms)
//   rhr        lowest heart rate of the night (bpm) — Oura's resting figure
//   resp       average breaths per minute
//   tdev       skin temperature deviation from baseline (°C)
//   readiness  Oura readiness score 0-100
//   sleepscore Oura sleep score 0-100
//   steps, energy (active kcal), spo2 (average %)
import { createClient } from "npm:@supabase/supabase-js@2";

const API = "https://api.ouraring.com/v2/usercollection";
const TOKEN = "https://api.ouraring.com/oauth/token";
const RANGE: Record<string, [number, number]> = {
  sleep: [0.5, 16], hrv: [3, 300], rhr: [25, 140], resp: [4, 40], tdev: [-5, 5],
  readiness: [1, 100], sleepscore: [1, 100], steps: [1, 100000], energy: [1, 10000], spo2: [50, 100],
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r1 = (x: number) => Math.round(x * 10) / 10;

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

async function pull(token: string, path: string, from: string, to: string) {
  const out: any[] = []; let next = "";
  for (let i = 0; i < 20; i++) {
    const u = new URL(API + "/" + path);
    u.searchParams.set("start_date", from); u.searchParams.set("end_date", to);
    if (next) u.searchParams.set("next_token", next);
    const res = await fetch(u, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) throw new Error(path + " " + res.status + " " + (await res.text()).slice(0, 120));
    const j = await res.json();
    out.push(...(j.data || []));
    next = j.next_token || ""; if (!next) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 3));
  const { data: rows } = await admin.from("oura_auth").select("*");
  if (!rows?.length) return Response.json({ idle: true, note: "no ring connected" });

  const out: any[] = [];
  for (const row of rows) {
    try {
      const token = await freshToken(admin, row);
      const to = new Date(); const from = new Date(to.getTime() - days * 86400000);
      const F = iso(from), T = iso(to);
      const [sleep, dsleep, ready, act, spo2] = await Promise.all([
        pull(token, "sleep", F, T), pull(token, "daily_sleep", F, T), pull(token, "daily_readiness", F, T),
        pull(token, "daily_activity", F, T), pull(token, "daily_spo2", F, T),
      ]);
      const byDay: Record<string, Record<string, number>> = {};
      const put = (d: string, k: string, v: any) => {
        if (!d || v == null || !Number.isFinite(Number(v))) return;
        const n = Number(v), [lo, hi] = RANGE[k];
        if (n < lo || n > hi) return;
        (byDay[d] ||= {})[k] = n;
      };
      // the night's sleep: sum the long periods (a split night is two rows); take
      // hrv / lowest hr / breath from the longest one
      const nights: Record<string, any[]> = {};
      for (const s of sleep) if (s.type === "long_sleep" && s.day) (nights[s.day] ||= []).push(s);
      for (const d in nights) {
        const ps = nights[d]; const secs = ps.reduce((n, p) => n + (p.total_sleep_duration || 0), 0);
        const main = ps.slice().sort((a, b) => (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0))[0];
        put(d, "sleep", r1(secs / 3600));
        put(d, "hrv", main.average_hrv != null ? Math.round(main.average_hrv) : null);
        put(d, "rhr", main.lowest_heart_rate);
        put(d, "resp", main.average_breath != null ? r1(main.average_breath) : null);
      }
      for (const x of dsleep) put(x.day, "sleepscore", x.score);
      for (const x of ready) { put(x.day, "readiness", x.score); put(x.day, "tdev", x.temperature_deviation != null ? Math.round(x.temperature_deviation * 100) / 100 : null); }
      for (const x of act) { put(x.day, "steps", x.steps); put(x.day, "energy", x.active_calories); }
      for (const x of spo2) put(x.day, "spo2", x.spo2_percentage?.average != null ? r1(x.spo2_percentage.average) : null);
      // today is still being written — keep yesterday and earlier only for sleep-derived keys
      // (activity for today is partial too; the next tick overwrites it)
      const parked = Object.keys(byDay).length ? await admin.rpc("health_park", { uid: row.user_id, sts: byDay }) : { error: null };
      if (parked.error) throw new Error("park: " + parked.error.message);
      const through = Object.keys(byDay).filter((d) => d < T).sort().pop() || null;
      await admin.from("oura_auth").update({ last_sync: new Date().toISOString(), last_error: null, synced_through: through }).eq("user_id", row.user_id);
      out.push({ user: row.user_id.slice(0, 8), days: Object.keys(byDay).length, from: F, to: T,
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
