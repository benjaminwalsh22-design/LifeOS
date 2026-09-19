// Oura OAuth2. Personal access tokens can no longer be created, so the ring is
// connected the same way OneDrive is: the app sends the signed-in user to
// /start, Oura redirects to /callback with a code, and the tokens are stored
// server-side. The browser never sees them.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://benjaminwalsh22-design.github.io/LifeOS/";
const AUTHORIZE = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN = "https://api.ouraring.com/oauth/token";
// daily: sleep, activity, readiness summaries · heartrate: lowest/avg HR series · spo2 · email for the status card
const SCOPES = "email daily heartrate spo2";

function redirectUri() {
  return Deno.env.get("SUPABASE_URL")! + "/functions/v1/oura-oauth/callback";
}

// The gateway serves function responses as text/plain, so no HTML here:
// bounce straight back into the app, which shows the outcome as a toast.
function page(msg: string, ok: boolean) {
  const u = new URL(APP_URL);
  u.searchParams.set("oura", ok ? "ok" : "err");
  if (!ok) u.searchParams.set("m", msg.slice(0, 160));
  return Response.redirect(u.toString(), 302);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cid = Deno.env.get("OURA_CLIENT_ID"), secret = Deno.env.get("OURA_CLIENT_SECRET");
  if (!cid || !secret) return page("The Oura app isn’t configured yet.", false);

  if (url.pathname.endsWith("/start")) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return new Response("unauthorized", { status: 401, headers: CORS });
    const state = crypto.randomUUID();
    await admin.from("oura_state").upsert({ state, user_id: data.user.id, created_at: new Date().toISOString() });
    const go = new URL(AUTHORIZE);
    go.searchParams.set("client_id", cid);
    go.searchParams.set("response_type", "code");
    go.searchParams.set("redirect_uri", redirectUri());
    go.searchParams.set("scope", SCOPES);
    go.searchParams.set("state", state);
    return Response.json({ url: go.toString() }, { headers: CORS });
  }

  if (url.pathname.endsWith("/callback")) {
    const err = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (err) return page(err.slice(0, 200), false);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!code || !state) return page("Oura didn’t send back an authorization code.", false);
    const { data: st } = await admin.from("oura_state").select("user_id, created_at").eq("state", state).single();
    if (!st) return page("That link has expired. Try connecting again.", false);
    await admin.from("oura_state").delete().eq("state", state);

    const body = new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: redirectUri(), client_id: cid, client_secret: secret,
    });
    const res = await fetch(TOKEN, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
    const tok = await res.json();
    if (!tok.access_token || !tok.refresh_token) return page((tok.error_description || tok.error || "No token was returned.").slice(0, 200), false);

    let email = "";
    try {
      const me = await fetch("https://api.ouraring.com/v2/usercollection/personal_info", {
        headers: { Authorization: "Bearer " + tok.access_token } }).then((r) => r.json());
      email = me.email || "";
    } catch (_) { /* cosmetic */ }

    await admin.from("oura_auth").upsert({
      user_id: st.user_id, access_token: tok.access_token, refresh_token: tok.refresh_token,
      expires_at: Date.now() + (tok.expires_in || 86400) * 1000, email,
      connected_at: new Date().toISOString(), last_error: null, synced_through: null,
    }, { onConflict: "user_id" });
    return page("The ring now feeds LifeOS directly. The first pull runs within the hour.", true);
  }

  if (url.pathname.endsWith("/disconnect")) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return new Response("unauthorized", { status: 401, headers: CORS });
    await admin.from("oura_auth").delete().eq("user_id", data.user.id);
    return Response.json({ ok: true }, { headers: CORS });
  }

  return new Response("not found", { status: 404 });
});
