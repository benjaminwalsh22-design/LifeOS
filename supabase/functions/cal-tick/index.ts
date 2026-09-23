// Pulls private iCal feeds (Google Calendar's "secret address in iCal format"
// works) and stores one row per occurrence for a rolling window, recurring
// events expanded. CAL_FEEDS is a JSON secret:
//   [{"name":"work","url":"https://calendar.google.com/calendar/ical/.../basic.ics","titles":false},
//    {"name":"family","url":"...","titles":true}]
// titles:false keeps event names out of anything a model reads (counts and
// hours still flow). ical.js does the parsing and the RRULE expansion.
import { createClient } from "npm:@supabase/supabase-js@2";
import ICAL from "npm:ical.js@2.1.0";

const BACK = 120, AHEAD = 45;   // days

function pick(evt: any, me: string) {
  const comp = evt.component;
  const attendees = comp.getAllProperties("attendee");
  let mine = "";
  for (const a of attendees) {
    const cn = String(a.getFirstValue() || "").toLowerCase();
    if (me && cn.includes(me)) mine = String(a.getParameter("partstat") || "");
  }
  return {
    title: evt.summary || "", location: evt.location || "",
    status: String(comp.getFirstPropertyValue("status") || ""), mine, attendees: attendees.length,
  };
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("unauthorized", { status: 401 });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let feeds: { name: string; url: string; titles?: boolean }[] = [];
  try { feeds = JSON.parse(Deno.env.get("CAL_FEEDS") || "[]"); } catch (_) { /* none */ }
  if (!feeds.length) return Response.json({ idle: true, note: "no calendar feeds configured" });
  const { data: acct } = await admin.from("lifeos_data").select("user_id").limit(1).single();
  if (!acct) return Response.json({ error: "no account" });
  const uid = acct.user_id;
  const me = (Deno.env.get("CAL_ME") || "").toLowerCase();   // my address, to read my own RSVP

  const now = new Date();
  const from = new Date(now.getTime() - BACK * 86400000), to = new Date(now.getTime() + AHEAD * 86400000);
  const fromT = ICAL.Time.fromJSDate(from, true), toT = ICAL.Time.fromJSDate(to, true);
  const out: any[] = [];

  for (const f of feeds) {
    try {
      const res = await fetch(f.url, { headers: { "user-agent": "LifeOS cal-tick" } });
      if (!res.ok) throw new Error("feed " + res.status);
      const jcal = ICAL.parse(await res.text());
      const root = new ICAL.Component(jcal);
      // TZID values only resolve once the feed's own VTIMEZONE blocks are registered
      for (const tz of root.getAllSubcomponents("vtimezone")) { try { ICAL.TimezoneService.register(tz); } catch (_) { /* dup */ } }
      const vevents = root.getAllSubcomponents("vevent");
      // exceptions (RECURRENCE-ID) attach to their master by UID
      const masters: any[] = [], exceptions: any[] = [];
      for (const v of vevents) { const e = new ICAL.Event(v); (e.isRecurrenceException() ? exceptions : masters).push(e); }
      for (const ex of exceptions) { const m = masters.find((x) => x.uid === ex.uid); if (m) m.relateException(ex); }

      const rows: any[] = [];
      const push = (e: any, start: any, end: any, keyStart: string) => {
        const s = start.toJSDate(), en = end.toJSDate();
        if (en < from || s > to) return;
        const allDay = !!start.isDate;
        const p = pick(e, me);
        rows.push({
          user_id: uid, cal: f.name, uid: e.uid + "@" + keyStart,
          day: allDay ? start.toString().slice(0, 10) : s.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }),
          start_at: s.toISOString(), end_at: en.toISOString(), all_day: allDay,
          title: p.title.slice(0, 200), location: p.location.slice(0, 200), status: p.status, mine: p.mine,
          attendees: p.attendees, share_title: !!f.titles,
        });
      };
      for (const e of masters) {
        if (!e.isRecurring()) { push(e, e.startDate, e.endDate, e.startDate.toString()); continue; }
        const it = e.iterator(); let next: any; let guard = 0;
        while ((next = it.next()) && guard++ < 2000) {
          if (next.compare(toT) > 0) break;
          const d = e.getOccurrenceDetails(next);
          if (d.endDate.compare(fromT) < 0) continue;
          push(d.item, d.startDate, d.endDate, next.toString());
        }
      }
      // replace the window for this feed, then insert
      await admin.from("cal_events").delete().eq("user_id", uid).eq("cal", f.name)
        .gte("day", from.toISOString().slice(0, 10)).lte("day", to.toISOString().slice(0, 10));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("cal_events").upsert(rows.slice(i, i + 500), { onConflict: "user_id,cal,uid" });
        if (error) throw new Error("store: " + error.message);
      }
      out.push({ cal: f.name, events: rows.length, titles: !!f.titles });
    } catch (e) {
      out.push({ cal: f.name, error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  return Response.json({ ok: true, window: [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)], out });
});
