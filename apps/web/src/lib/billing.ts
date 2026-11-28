import "server-only";
import { GetPricesResult } from "@prepora/shared/api/billing";
import { PlanLimits } from "@prepora/shared/api/credits";
import { createClient } from "@/lib/supabase/server";

// Billing data for the signed-in app (M9-F1…F3), read with the student's own session (RLS).

/** What the student's country can buy (get_prices, M9-B1), or null (no country / not listed). */
export async function fetchPricing(country: string | null | undefined): Promise<GetPricesResult> {
  if (!country) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_prices", { p_country: country });
  if (error) {
    console.error("get_prices failed", error.code, error.message);
    return null;
  }
  const parsed = GetPricesResult.safeParse(data);
  if (!parsed.success) console.error("get_prices: unexpected shape", parsed.error.issues[0]);
  return parsed.success ? parsed.data : null;
}

export type PlanInfo = { id: "free" | "gold" | "platinum"; name: string; limits: PlanLimits };

export async function fetchPlans(): Promise<PlanInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("id, name, limits").eq("is_active", true);
  const order = { free: 0, gold: 1, platinum: 2 } as const;
  return (data ?? [])
    .flatMap((p) => {
      const limits = PlanLimits.safeParse(p.limits);
      return limits.success ? [{ id: p.id, name: p.name, limits: limits.data }] : [];
    })
    .sort((a, b) => order[a.id] - order[b.id]);
}

export type MySubscription = {
  id: string;
  plan_id: "gold" | "platinum";
  kind: "subscription" | "exam_pack";
  provider: string;
  status: "active" | "past_due";
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  scheduled_plan_id: "gold" | "platinum" | null;
  currency: string | null;
  amount_minor: number | null;
  /** The price bought (prices.id) and its credits: exam pack upgrades are quoted from them. */
  price_id: string | null;
  price_credits: number | null;
};

/** The student's running plan (active, or past_due in its grace period), newest end first. */
export async function fetchMySubscription(): Promise<MySubscription | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_id, kind, provider, status, current_period_start, current_period_end, cancel_at_period_end, scheduled_price_id, price_id, currency, amount_minor")
    .in("status", ["active", "past_due"])
    .gt("current_period_end", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order("current_period_end", { ascending: false })
    .limit(1);
  if (error) {
    console.error("subscriptions failed", error.code, error.message);
    return null;
  }
  const s = data[0];
  if (!s || s.plan_id === "free" || s.kind === "topup" || !(s.status === "active" || s.status === "past_due")) return null;
  let scheduled: MySubscription["scheduled_plan_id"] = null;
  if (s.scheduled_price_id) {
    const { data: p } = await supabase.from("prices").select("plan_id").eq("id", s.scheduled_price_id).maybeSingle();
    scheduled = p?.plan_id === "gold" || p?.plan_id === "platinum" ? p.plan_id : null;
  }
  let priceCredits: number | null = null;
  if (s.price_id) {
    const { data: p } = await supabase.from("prices").select("credits").eq("id", s.price_id).maybeSingle();
    priceCredits = p?.credits ?? null;
  }
  return {
    id: s.id,
    plan_id: s.plan_id,
    kind: s.kind,
    provider: s.provider,
    status: s.status,
    current_period_start: s.current_period_start,
    current_period_end: s.current_period_end,
    cancel_at_period_end: s.cancel_at_period_end,
    scheduled_plan_id: scheduled,
    currency: s.currency,
    amount_minor: s.amount_minor,
    price_id: s.price_id,
    price_credits: priceCredits,
  };
}
