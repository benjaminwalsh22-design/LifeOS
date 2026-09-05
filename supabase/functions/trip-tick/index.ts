// Reads the TripIt calendar feed and keeps public.trips in step with it.
// The feed carries a rolling ~90 days, so this handles trips from here on;
// anything older has to come from the API export.
import { createClient } from "npm:@supabase/supabase-js@2";

// ---- iCalendar is line-folded and escaped; unpick both before parsing ----
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}
const unescape_ = (s: string) =>
  s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

type Ev = Record<string, string> & { _params?: Record<string, string> };

function events(text: string): Ev[] {
  const out: Ev[] = [];
  let cur: Ev | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") { cur = {} as Ev; continue; }
    if (line === "END:VEVENT") { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const c = line.indexOf(":");
    if (c < 0) continue;
    const lhs = line.slice(0, c), val = unescape_(line.slice(c + 1));
    const [name, ...params] = lhs.split(";");
    cur[name.toUpperCase()] = val;
    for (const p of params) {
      const eq = p.indexOf("=");
      if (eq > 0) cur[name.toUpperCase() + ";" + p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
  }
  return out;
}

// DTSTART;VALUE=DATE:20260912  or  DTSTART:20260912T140000Z
function day(v: string | undefined): string | null {
  if (!v) return null;
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
// an all-day DTEND is exclusive — the day after the last day
function endDay(ev: Ev): string | null {
  const d = day(ev["DTEND"] ?? ev["DTSTART"]);
  if (!d) return null;
  if ((ev["DTEND;VALUE"] ?? "").toUpperCase() === "DATE" && ev["DTEND"]) {
    const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  }
  return d;
}

// TripIt already tells us where the trips are: each trip is one all-day event
// carrying its name and primary location, and every flight, hotel and car is a
// timed event falling inside it. No need to guess the boundaries.
const isTrip = (e: Ev) => (e["DTSTART;VALUE"] ?? "").toUpperCase() === "DATE";

function group(evs: Ev[]) {
  const trips = evs.filter(isTrip).map(e => ({
    uid: "ics:" + (e["UID"] || ""),
    title: e["SUMMARY"] || "",
    start_day: day(e["DTSTART"])!,
    end_day: endDay(e)!,
    city: e["LOCATION"] || "",
    source: "ics",
    segments: [] as any[],
  })).filter(t => t.start_day).sort((a, b) => a.start_day.localeCompare(b.start_day));

  const loose: any[] = [];
  for (const e of evs) {
    if (isTrip(e)) continue;
    const from = day(e["DTSTART"]); if (!from) continue;
    const seg = {
      kind: kindOf(e["SUMMARY"] || ""),
      title: e["SUMMARY"] || "",
      loc: e["LOCATION"] || "",
      geo: e["GEO"] || "",
      from, to: endDay(e) || from,
    };
    // trips can nest — a weekend in San Francisco inside a longer stay — so take
    // the tightest window that contains the segment, not the first one found
    const inside = trips.filter(t => from >= t.start_day && from <= t.end_day)
      .sort((a, b) => span(a) - span(b))[0];
    if (inside) { inside.segments.push(seg); continue; }
    // TripIt ends a trip on the last night, so the flight home falls just outside it
    const home = trips.filter(t => from > t.end_day && daysBetween(t.end_day, from) <= 2)
      .sort((a, b) => b.end_day.localeCompare(a.end_day))[0];
    if (home) { home.segments.push(seg); if (seg.to > home.end_day) home.end_day = seg.to; continue; }
    loose.push({ ...seg, uid: e["UID"] || (seg.from + seg.title) });
  }
  // a booking with no trip around it still counts as a day away
  for (const s of loose) {
    trips.push({ uid: "ics:" + s.uid, title: s.title,
                 start_day: s.from, end_day: s.to, city: s.loc, source: "ics", segments: [s] });
  }
  for (const t of trips) t.segments.sort((a: any, b: any) => a.from.localeCompare(b.from));
  return trips.sort((a, b) => a.start_day.localeCompare(b.start_day));
}
function kindOf(summary: string): string {
  const s = summary.toLowerCase();
  if (/^[a-z0-9]{2}\d+\s/i.test(summary) || / to /.test(s)) return "flight";
  if (s.startsWith("check-in") || s.startsWith("check out") || s.includes("hotel")) return "lodging";
  if (s.includes("rental car") || s.includes("pick up") || s.includes("drop off")) return "car";
  if (s.includes("train") || s.includes("rail")) return "rail";
  return "other";
}
const span = (t: any) => daysBetween(t.start_day, t.end_day);
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
}
function addDays(d: string, n: number): string {
  const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const url = Deno.env.get("TRIPIT_ICS");
  if (!url) return Response.json({ error: "TRIPIT_ICS not set" });
  let body: any = {}; try { body = await req.json(); } catch (_) { /* empty */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const res = await fetch(url, { headers: { "User-Agent": "lifeos/1.0" } });
  if (!res.ok) return Response.json({ error: "feed " + res.status });
  const text = await res.text();
  const evs = events(text);

  if (body.peek) {
    return Response.json({
      bytes: text.length, events: evs.length,
      keys: [...new Set(evs.flatMap(e => Object.keys(e)))].sort(),
      sample: evs.slice(0, 6),
      trips: group(evs),
    });
  }

  const { data: owner } = await admin.from("lifeos_data").select("user_id").limit(1).single();
  if (!owner) return Response.json({ error: "no account" });
  const trips = group(evs);
  if (trips.length) {
    const { error } = await admin.from("trips").upsert(
      trips.map(t => ({ user_id: owner.user_id, ...t, updated_at: new Date().toISOString() })),
      { onConflict: "user_id,uid" });
    if (error) return Response.json({ error: error.message });
  }
  // mark the days already lived through as away, so travel can be charted next
  // to mood and sleep. Future trips stay out of the daily record until they happen.
  const today = new Date().toISOString().slice(0, 10);
  const away: Record<string, Record<string, number>> = {};
  for (const t of trips) {
    for (let d = t.start_day; d <= t.end_day && d <= today; d = addDays(d, 1)) away[d] = { away: 1 };
  }
  if (Object.keys(away).length) await admin.rpc("health_park", { uid: owner.user_id, sts: away });

  return Response.json({ events: evs.length, trips: trips.length, away_days: Object.keys(away).length,
    span: trips.length ? trips[0].start_day + " -> " + trips[trips.length - 1].end_day : null });
});
