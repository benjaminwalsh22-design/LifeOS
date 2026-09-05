// Microsoft OAuth for OneDrive photo access.
// The refresh token is exchanged and stored here, server-side — it never reaches the browser.
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://benjaminwalsh22-design.github.io/LifeOS/";
const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const SCOPES = "offline_access Files.Read.All User.Read";

function redirectUri() {
  return Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".supabase.co") + "/functions/v1/ms-oauth/callback";
}

function page(msg: string, ok: boolean) {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#F7F6F3;color:#26221D;padding:24px;text-align:center}
.c{max-width:340px}h1{font-size:19px;margin:0 0 8px}p{color:#6B655C;margin:0 0 20px}
a{display:block;background:#33527B;color:#fff;text-decoration:none;padding:14px;border-radius:12px;font-weight:600}</style>
<div class="c"><h1>${ok ? "OneDrive connected" : "Couldn’t connect"}</h1><p>${msg}</p>
<a href="${APP_URL}">Back to LifeOS</a></div>`,
    { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // preflight has to be answered before anything else looks at the path
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cid = Deno.env.get("MS_CLIENT_ID"), secret = Deno.env.get("MS_CLIENT_SECRET");
  if (!cid || !secret) return page("The Microsoft app isn’t configured yet.", false);

  // ---- step 1: the app sends the signed-in user here to begin ----
  if (url.pathname.endsWith("/start")) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return new Response("unauthorized", { status: 401, headers: CORS });
    const state = crypto.randomUUID();
    await admin.from("ms_state").upsert({ state, user_id: data.user.id, created_at: new Date().toISOString() });
    const go = new URL(AUTH + "/authorize");
    go.searchParams.set("client_id", cid);
    go.searchParams.set("response_type", "code");
    go.searchParams.set("redirect_uri", redirectUri());
    go.searchParams.set("response_mode", "query");
    go.searchParams.set("scope", SCOPES);
    go.searchParams.set("state", state);
    go.searchParams.set("prompt", "select_account");
    return Response.json({ url: go.toString() }, { headers: CORS });
  }

  // ---- step 2: Microsoft redirects back here with a code ----
  if (url.pathname.endsWith("/callback")) {
    const err = url.searchParams.get("error_description") || url.searchParams.get("error");
    if (err) return page(err.slice(0, 200), false);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!code || !state) return page("Microsoft didn’t send back an authorization code.", false);

    const { data: st } = await admin.from("ms_state").select("user_id").eq("state", state).single();
    if (!st) return page("That sign-in link has expired. Try connecting again.", false);
    await admin.from("ms_state").delete().eq("state", state);

    const body = new URLSearchParams({
      client_id: cid, client_secret: secret, code, grant_type: "authorization_code",
      redirect_uri: redirectUri(), scope: SCOPES,
    });
    const res = await fetch(AUTH + "/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString(),
    });
    const tok = await res.json();
    if (!tok.refresh_token) return page((tok.error_description || "No refresh token was returned.").slice(0, 200), false);

    let account = "";
    try {
      const me = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: "Bearer " + tok.access_token },
      }).then((r) => r.json());
      account = me.userPrincipalName || me.mail || me.displayName || "";
    } catch (_) { /* cosmetic only */ }

    await admin.from("ms_auth").upsert({
      user_id: st.user_id, refresh_token: tok.refresh_token, access_token: tok.access_token,
      expires_at: Date.now() + (tok.expires_in || 3600) * 1000, account,
      connected_at: new Date().toISOString(), last_error: null, delta_link: null,
    }, { onConflict: "user_id" });

    return page("LifeOS can now read photo dates from your OneDrive. Indexing starts within a few minutes.", true);
  }

  // ---- disconnect ----
  if (url.pathname.endsWith("/disconnect")) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return new Response("unauthorized", { status: 401, headers: CORS });
    await admin.from("ms_auth").delete().eq("user_id", data.user.id);
    return Response.json({ ok: true }, { headers: CORS });
  }

  return new Response("not found", { status: 404 });
});
