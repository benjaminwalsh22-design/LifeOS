// Pulls new and changed YNAB transactions and keeps the day-level spending in
// step with them. Uses YNAB's delta requests, so a normal run transfers only
// what actually changed since last time.
import { createClient } from "npm:@supabase/supabase-js@2";

const SEED_FROM = "2026-07-01";   // everything before this came from the CSV export
const API = "https://api.ynab.com/v1";

// same buckets the eleven-year analysis used, so old and new rows agree
const BUCKET: Record<string, string> = {
  "Retirement Savings":"invested","Nest Egg":"invested","Emergency Fund":"invested","Down Payment":"invested",
  "Taxes":"tax","Property Taxes":"tax",
  "Mortgage":"home","Home Improvements":"home","Utilities":"home","Home Services":"home",
  "Childcare":"family","Stewie Fund":"family","Stewie":"family",
  "Health Care":"health","Travel":"travel","Gifts":"gifts","Donations":"giving",
  "Insurance and Registration":"car","Car Fund":"car","Car Payments":"car","Fuel":"car",
  "Student Loan Payment":"debt","Law Office of Benjamin Walsh":"business",
  "Personal Reimbursements":"wash","Fortiss Reimbursements":"wash",
  "Shopping":"day","Food":"day","Eating Out":"day","Household Goods":"day",
  "Entertainment":"day","Groceries":"day","Cell Phone":"day",
  "Gym Membership":"day","Gym":"day","Wedding!":"oneoff","Men’s Club":"oneoff",
};
// buckets that are money genuinely consumed, which is what the app charts
const CONSUMED = new Set(["home","day","family","car","travel","health","gifts","debt","giving","oneoff"]);

type Row = { id: string; day: string; amt: number; bucket: string; cat: string; payee: string };

// One YNAB transaction can be a split; each part carries its own category.
function flatten(t: any): Row[] {
  const parts = (t.subtransactions && t.subtransactions.length)
    ? t.subtransactions.filter((s: any) => !s.deleted)
    : [t];
  const out: Row[] = [];
  for (const p of parts) {
    const cat = String(p.category_name ?? t.category_name ?? "").trim();
    const isTransfer = !!(p.transfer_account_id ?? t.transfer_account_id);
    if (!cat || cat === "Uncategorized") continue;         // transfers and tracking-account noise
    if (cat.startsWith("Inflow")) {
      out.push({ id: p.id ?? t.id, day: t.date, amt: -(p.amount ?? t.amount) / 1000,
                 bucket: "income", cat, payee: t.payee_name ?? "" });
      continue;
    }
    if (isTransfer && !cat) continue;
    out.push({ id: p.id ?? t.id, day: t.date, amt: -(p.amount ?? t.amount) / 1000,
               bucket: BUCKET[cat] ?? "other", cat, payee: t.payee_name ?? "" });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) {
    return new Response("unauthorized", { status: 401 });
  }
  const token = Deno.env.get("YNAB_TOKEN"), budget = Deno.env.get("YNAB_BUDGET");
  if (!token || !budget) return Response.json({ error: "YNAB_TOKEN / YNAB_BUDGET not set" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: owner } = await admin.from("lifeos_data").select("user_id").limit(1).single();
  if (!owner) return Response.json({ error: "no account" });
  const uid = owner.user_id;

  const { data: st } = await admin.from("ynab_state").select("*").eq("user_id", uid).maybeSingle();
  const knowledge = Number(st?.server_knowledge ?? 0);

  const q = knowledge > 0 ? `last_knowledge_of_server=${knowledge}` : `since_date=${SEED_FROM}`;
  const res = await fetch(`${API}/budgets/${budget}/transactions?${q}`,
    { headers: { Authorization: "Bearer " + token } });
  if (!res.ok) {
    const body = await res.text();
    return Response.json({ error: "ynab " + res.status, detail: body.slice(0, 200) }, { status: 200 });
  }
  const data = (await res.json()).data;
  const txns: any[] = data.transactions ?? [];

  const days = new Set<string>();
  const keep: Row[] = [];
  const drop: string[] = [];
  for (const t of txns) {
    days.add(t.date);
    if (t.deleted) { drop.push(t.id); continue; }
    for (const r of flatten(t)) { keep.push(r); days.add(r.day); }
    // a split whose parts changed can leave orphans; clearing the parent id is harmless
    if (t.subtransactions?.length) drop.push(t.id);
  }

  if (drop.length) {
    await admin.from("ynab_txn").delete().eq("user_id", uid).in("id", drop.slice(0, 500));
  }
  for (let i = 0; i < keep.length; i += 500) {
    const batch = keep.slice(i, i + 500).map(r => ({ user_id: uid, ...r }));
    const { error } = await admin.from("ynab_txn").upsert(batch, { onConflict: "user_id,id" });
    if (error) return Response.json({ error: "upsert: " + error.message });
  }

  // recompute only the days this delta touched, and park them for the flush job
  const stats: Record<string, Record<string, number>> = {};
  if (days.size) {
    const list = [...days].sort();
    const { data: rows } = await admin.from("ynab_txn")
      .select("day, amt, bucket").eq("user_id", uid)
      .gte("day", list[0]).lte("day", list[list.length - 1]);
    const tot: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (!days.has(r.day)) continue;
      if (!CONSUMED.has(r.bucket)) continue;
      tot[r.day] = (tot[r.day] ?? 0) + Number(r.amt);
    }
    for (const d of days) stats[d] = { spend: Math.round((tot[d] ?? 0) * 100) / 100 };
  }

  // what is left in the everyday envelopes this month — the number the tile shows
  let left: number | null = null;
  const mo = await fetch(`${API}/budgets/${budget}/months/current`,
    { headers: { Authorization: "Bearer " + token } });
  if (mo.ok) {
    const m = (await mo.json()).data.month;
    left = (m.categories ?? [])
      .filter((c: any) => !c.deleted && !c.hidden && c.category_group_name === "Everyday Expenses")
      .reduce((s: number, c: any) => s + c.balance / 1000, 0);
    const today = new Date().toISOString().slice(0, 10);
    stats[today] = { ...(stats[today] ?? {}), budget: Math.round(left) };
  }

  if (Object.keys(stats).length) await admin.rpc("health_park", { uid, sts: stats });

  await admin.from("ynab_state").upsert({
    user_id: uid, budget_id: budget,
    server_knowledge: data.server_knowledge ?? knowledge,
    last_sync: new Date().toISOString(),
    note: `${txns.length} changed, ${keep.length} rows, ${days.size} days`,
  }, { onConflict: "user_id" });

  return Response.json({
    seeded: knowledge === 0, changed: txns.length, rows: keep.length,
    days: days.size, left, knowledge: data.server_knowledge,
  });
});
