import { createClient } from "npm:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const APP_URL = "https://benjaminwalsh22-design.github.io/LifeOS/";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* empty */ }

  const isCron = req.headers.get("x-cron-secret") === Deno.env.get("CRON_SECRET");
  let testUser: string | null = null;

  if (!isCron) {
    const auth = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await admin.auth.getUser(auth);
    if (error || !data?.user || !body.test) return new Response("unauthorized", { status: 401, headers: cors });
    testUser = data.user.id;
  }

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false });
  const appServer = await webpush.ApplicationServer.new({
    contactInformation: "mailto:benjamin.walsh22@gmail.com", vapidKeys,
  });

  const { data: subs } = await admin.from("push_subs").select("*");
  const results: any[] = [];

  async function send(s: any, payload: any) {
    try {
      await appServer.subscribe(s.sub).pushTextMessage(JSON.stringify(payload), {});
      results.push({ kind: payload.kind, ok: true });
      return true;
    } catch (e) {
      const msg = String(e);
      results.push({ kind: payload.kind, ok: false, err: msg.slice(0, 120) });
      if (/410|404|expired|gone/i.test(msg)) await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
      return false;
    }
  }

  if (testUser) {
    const mine = (subs || []).filter((s) => s.user_id === testUser);
    for (const s of mine) {
      await send(s, { kind: "test", title: "LifeOS", body: "Push notifications are working 🎉", url: APP_URL });
    }
    return Response.json({ test: true, devices: mine.length, results }, { headers: cors });
  }

  // ---- scheduled tick: ask the database only for the few facts we need ----
  const now = new Date();
  const factCache = new Map<string, any>();

  for (const s of subs || []) {
    const prefs = s.prefs || {};
    const offMin = typeof s.tz_offset === "number" ? s.tz_offset : 0;
    const local = new Date(now.getTime() + offMin * 60000);
    const localDay = local.toISOString().slice(0, 10);
    const hour = local.getUTCHours();

    const jh = typeof prefs.journalHour === "number" ? prefs.journalHour : 21;
    const wantJournal = prefs.journalOn !== false && hour === jh;
    const wantBdays = prefs.birthdaysOn !== false && hour === 9;
    const wantReview = prefs.reviewOn !== false && hour === 18 && local.getUTCDay() === 0;
    if (!wantJournal && !wantBdays && !wantReview) continue;   // nothing due: no data fetched at all

    const key = s.user_id + "|" + localDay;
    if (!factCache.has(key)) {
      const { data: f } = await admin.rpc("push_facts", { uid: s.user_id, day: localDay });
      factCache.set(key, f || { has_today: false, bdays: [] });
    }
    const facts = factCache.get(key);
    const due: any[] = [];

    if (wantJournal) {
      // He writes the page at night and photographs it the next morning, so
      // today's entry is never expected yet. A gap only exists once YESTERDAY
      // has gone unlogged — otherwise this fires every single evening forever.
      const last = facts.last_entry as string | null;
      const gap = last
        ? Math.round((Date.parse(localDay + "T12:00:00Z") - Date.parse(last + "T12:00:00Z")) / 86400000)
        : 999;
      if (gap >= 2) {
        const body = !last ? "No pages yet — a photo of one is enough to start."
          : gap === 2 ? "Yesterday's page hasn't come in yet — a photo is enough."
          : gap > 30 ? "It's been a while. A photo of any page picks it back up."
          : (gap - 1) + " days unlogged. A photo of each page is enough.";
        due.push({ kind: "journal", title: "Journal", body });
      }
    }
    if (wantBdays) {
      for (const name of facts.bdays || []) {
        due.push({ kind: "bday-" + String(name).slice(0, 20), title: "Birthday", body: "It’s " + name + "’s birthday today 🎉" });
      }
    }
    if (wantReview) due.push({ kind: "review", title: "Weekly Review", body: "Your week is ready to be read." });

    for (const d of due) {
      const { error: dup } = await admin.from("push_log").insert({
        user_id: s.user_id, kind: d.kind, day: localDay, endpoint: s.endpoint,
      });
      if (dup) continue;
      await send(s, { ...d, url: APP_URL });
    }
  }

  if (now.getUTCHours() === 3 && now.getUTCMinutes() < 15) {
    await admin.from("push_log").delete().lt("day", new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10));
  }

  return Response.json({ checked: (subs || []).length, results }, { headers: cors });
});
