// Receives the COO/CFO report. POST /functions/v1/biz-in/<token>
//
// {
//   "period_start": "2026-08-31", "period_end": "2026-09-06", "kind": "weekly",
//   "metrics": { "billed": 41200, "collected": 38150, "hours": 34.5, ... },
//   "narrative": "Two mediation prep weeks back to back..."
// }
//
// Figures the household ledger never sees — retirement contributions held at the
// firm, owner compensation, retained earnings — belong here. Client information
// does not.
import { createClient } from "npm:@supabase/supabase-js@2";

// Anything numeric is kept, but these are the ones the app and the digest know
// how to reason about, with sanity bounds so a units slip leaves a gap not a lie.
const RANGE: Record<string, [number, number]> = {
  billed: [0, 2_000_000], collected: [0, 2_000_000], wip: [0, 5_000_000],
  ar: [0, 5_000_000], hours: [0, 168], billable_hours: [0, 168],
  matters_open: [0, 5000], matters_new: [0, 500], matters_closed: [0, 500],
  retirement_ytd: [0, 1_000_000], defined_benefit_ytd: [0, 1_000_000],
  owner_comp_ytd: [0, 5_000_000], net_income_ytd: [-5_000_000, 10_000_000],
  revenue_ytd: [0, 20_000_000], sde_ytd: [-5_000_000, 20_000_000],
  cash: [0, 20_000_000],
};

const day = (s: any) => {
  const t = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let token = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  try { token = decodeURIComponent(token); } catch (_) { /* leave it */ }
  token = token.trim().replace(/[^0-9a-zA-Z_-]/g, "");
  if (token.length < 20) return Response.json({ error: "missing token" }, { status: 401, headers: cors });

  const { data: row } = await admin.from("biz_tokens").select("user_id").eq("token", token).single();
  if (!row) return Response.json({ error: "unknown token" }, { status: 401, headers: cors });

  let body: any;
  try { body = await req.json(); }
  catch (_) { return Response.json({ error: "send JSON" }, { status: 400, headers: cors }); }

  const end = day(body.period_end);
  if (!end) return Response.json({ error: "period_end must be a date" }, { status: 400, headers: cors });
  const start = day(body.period_start) || end;
  const kind = ["daily", "weekly", "monthly", "quarterly", "annual"].includes(String(body.kind))
    ? String(body.kind) : "weekly";

  const metrics: Record<string, number> = {};
  const skipped: string[] = [];
  for (const [k, v] of Object.entries(body.metrics ?? {})) {
    const n = Number(v);
    if (!Number.isFinite(n)) { skipped.push(k); continue; }
    const r = RANGE[k];
    if (r && (n < r[0] || n > r[1])) { skipped.push(k + " (out of range)"); continue; }
    metrics[k] = Math.round(n * 100) / 100;
  }

  const narrative = String(body.narrative ?? "").slice(0, 6000);
  if (!Object.keys(metrics).length && !narrative.trim()) {
    return Response.json({ error: "nothing usable — send metrics, a narrative, or both" }, { status: 400, headers: cors });
  }

  const { error } = await admin.from("biz_report").upsert({
    user_id: row.user_id, period_start: start, period_end: end, kind,
    metrics, narrative, at: new Date().toISOString(),
  }, { onConflict: "user_id,period_end,kind" });
  if (error) return Response.json({ error: error.message }, { status: 500, headers: cors });

  await admin.from("biz_tokens").update({ last_post: new Date().toISOString() }).eq("token", token);
  return Response.json({
    ok: true, period: start + " to " + end, kind,
    stored: Object.keys(metrics), narrative_chars: narrative.length,
    skipped: skipped.length ? skipped : undefined,
  }, { headers: cors });
});
