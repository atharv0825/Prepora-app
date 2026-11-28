// POST /functions/v1/admin-end-plan (support, M9-A1). Admins only. Puts a student back on Free,
// whatever they have: the admin panel's Change plan → Free calls this.
//
//   1. Every running monthly subscription paid through Razorpay or Paddle is cancelled at the
//      provider NOW (no refund; refunds are done in the provider's dashboard), then marked
//      cancelled here. The provider's later "cancelled" webhook finds it already ended.
//   2. admin_set_manual_plan(free), called as the admin (so is_admin() and audit_log record who):
//      ends manual plans and exam packs and recomputes profiles.plan.
// If a provider refuses a cancellation, nothing is changed here and the error is returned.

import { z } from "../_shared/deps.ts";
import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { paddle, ProviderError, razorpay } from "../_shared/billing.ts";

const Input = z.object({ user_id: z.uuid(), note: z.string().trim().min(3).max(500) }).strict();

Deno.serve(createHandler({ name: "admin-end-plan", auth: "required", input: Input }, async ({ input, supabase, admin }) => {
  const { data: isAdmin, error: roleError } = await supabase.rpc("is_admin");
  if (roleError) throw roleError;
  if (!isAdmin) throw errors.forbidden("Admins only.");

  const db = admin();
  const { data: subs, error } = await db.from("subscriptions")
    .select("id, provider, provider_subscription_id")
    .eq("user_id", input.user_id).eq("kind", "subscription")
    .in("provider", ["razorpay", "paddle"]).in("status", ["active", "past_due"]);
  if (error) throw error;

  const cancelled: string[] = [];
  for (const s of subs) {
    if (!s.provider_subscription_id) continue;
    try {
      if (s.provider === "razorpay") await razorpay().cancelNow(s.provider_subscription_id);
      else await paddle().cancelNow(s.provider_subscription_id);
    } catch (err) {
      if (err instanceof ProviderError) {
        console.error(`[admin-end-plan] ${err.provider} ${err.status} cancelling ${s.id}`);
        throw errors.conflict(`${s.provider === "razorpay" ? "Razorpay" : "Paddle"} didn't cancel the subscription (${err.status}). Cancel it in their dashboard, then try again.`);
      }
      throw err;
    }
    const now = new Date().toISOString();
    const { error: upError } = await db.from("subscriptions")
      .update({ status: "cancelled", cancelled_at: now, current_period_end: now })
      .eq("id", s.id).in("status", ["active", "past_due"]);
    if (upError) throw upError;
    cancelled.push(`${s.provider} ${s.provider_subscription_id}`);
  }

  // As the admin: is_admin() check, the rest of the plans ended, profile recomputed, audited.
  const note = cancelled.length ? `${input.note} (cancelled now at the provider: ${cancelled.join(", ")})`.slice(0, 500) : input.note;
  const { data, error: endError } = await supabase.rpc("admin_set_manual_plan", {
    p_user_id: input.user_id,
    p_plan: "free",
    p_days: null as unknown as number,
    p_grant_credits: false,
    p_note: note,
  });
  if (endError) {
    if (endError.code === "P0002") throw errors.notFound("This user no longer exists.");
    throw endError;
  }
  return { plan_after: (data as { plan_after: string }).plan_after, cancelled: cancelled.length };
}));
