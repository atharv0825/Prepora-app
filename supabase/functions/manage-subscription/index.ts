// POST /functions/v1/manage-subscription (M9-B4/B5). Contract: packages/shared/src/api/billing.ts
// (ManageSubscriptionRequest → ManageSubscriptionResponse). Acts on the student's running monthly
// subscription (exam packs don't renew, so there is nothing to manage).
//
//   portal       Paddle: a customer portal link (payment method, invoices, cancel). Razorpay has
//                no portal: 409 conflict, the app shows Cancel and Change plan instead.
//   cancel       At the period end: the plan lasts until then. Razorpay: cancel at cycle end.
//                Paddle: cancel effective next billing period.
//   change_plan  To another monthly plan on sale in the student's country.
//                Upgrade (Gold → Platinum): at once; the provider charges the prorated
//                difference, and the webhook gives the plan and the credit difference straight away.
//                Downgrade: from the period end; the plan stays until then.
//
// The change is recorded here at once (billing_mark_*) so the app shows it; the provider's webhook
// confirms it and makes the plan change (billing_apply_event).

import { z } from "../_shared/deps.ts";
import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { paddle, PLAN_RANK, ProviderError, razorpay } from "../_shared/billing.ts";

// Same as ManageSubscriptionRequest (packages/shared/src/api/billing.ts).
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("portal") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("change_plan"), price_id: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/) }).strict(),
]);

type Offer = { id: string; plan_id: string | null };
type Prices = { enabled: boolean; subscriptions: Offer[] };

const COLUMNS = "id, plan_id, kind, provider, provider_subscription_id, provider_customer_id, status, current_period_end, cancel_at_period_end, scheduled_price_id, price_id";

Deno.serve(createHandler({ name: "manage-subscription", auth: "required", input: Input }, async ({ input, user, admin }) => {
  const db = admin();
  const me = user!;

  const { data: subs, error } = await db.from("subscriptions").select(COLUMNS)
    .eq("user_id", me.id).eq("kind", "subscription").in("status", ["active", "past_due"])
    .in("provider", ["razorpay", "paddle"])
    .order("current_period_end", { ascending: false }).limit(1);
  if (error) throw error;
  const sub = subs[0];
  if (!sub?.provider_subscription_id) throw errors.notFound("You don't have a monthly plan to manage.");

  const summary = async (id: string) => {
    const { data, error: e } = await db.from("subscriptions").select(COLUMNS).eq("id", id).single();
    if (e) throw e;
    let scheduled: string | null = null;
    if (data.scheduled_price_id) {
      const { data: p } = await db.from("prices").select("plan_id").eq("id", data.scheduled_price_id).maybeSingle();
      scheduled = p?.plan_id ?? null;
    }
    return {
      subscription: {
        id: data.id,
        plan_id: data.plan_id,
        provider: data.provider,
        status: data.status,
        current_period_end: data.current_period_end,
        cancel_at_period_end: data.cancel_at_period_end,
        scheduled_plan_id: scheduled,
      },
    };
  };

  try {
    if (input.action === "portal") {
      if (sub.provider !== "paddle" || !sub.provider_customer_id) {
        throw errors.conflict("Manage this plan here: change plan or cancel.");
      }
      return { url: await paddle().portalUrl(sub.provider_customer_id, [sub.provider_subscription_id]) };
    }

    if (input.action === "cancel") {
      if (!sub.cancel_at_period_end) {
        if (sub.provider === "razorpay") await razorpay().cancelAtCycleEnd(sub.provider_subscription_id);
        else await paddle().cancelAtPeriodEnd(sub.provider_subscription_id);
        const { error: e } = await db.rpc("billing_mark_cancel", { p_subscription_id: sub.id });
        if (e) throw e;
      }
      return await summary(sub.id);
    }

    // change_plan
    if (sub.cancel_at_period_end) throw errors.conflict("This plan is cancelled. Subscribe again after it ends.");
    const { data: profile } = await db.from("profiles").select("country_code").eq("id", me.id).maybeSingle();
    const { data: prices, error: gError } = await db.rpc("get_prices", { p_country: profile?.country_code ?? "" });
    if (gError) throw gError;
    const offer = (prices as unknown as Prices | null)?.subscriptions.find((o) => o.id === input.price_id);
    if (!offer) throw errors.priceNotAvailable();
    const { data: target, error: tError } = await db.from("prices").select("id, plan_id, provider, provider_price_id").eq("id", offer.id).single();
    if (tError) throw tError;
    if (target.provider !== sub.provider) throw errors.conflict("Cancel this plan and subscribe again to switch payment provider.");
    if (!target.provider_price_id) throw errors.priceNotAvailable("This option isn't on sale yet.");
    const up = (PLAN_RANK[target.plan_id!] ?? 0) - (PLAN_RANK[sub.plan_id] ?? 0);
    if (up === 0) throw errors.conflict("You're already on this plan.");

    if (sub.provider === "razorpay") {
      await razorpay().changePlan(sub.provider_subscription_id, target.provider_price_id, up > 0 ? "now" : "cycle_end");
    } else {
      // Paddle changes the items at once: upgrades bill the prorated difference now; downgrades
      // aren't billed until the renewal, and billing_apply_event keeps the plan until then.
      await paddle().changePrice(sub.provider_subscription_id, target.provider_price_id, up > 0 ? "prorated_immediately" : "do_not_bill");
    }
    if (up < 0) {
      const { error: e } = await db.rpc("billing_mark_scheduled_change", { p_subscription_id: sub.id, p_price_id: target.id });
      if (e) throw e;
    }
    return await summary(sub.id);
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(`[manage-subscription] ${err.provider} ${err.status} ${input.action}`);
      // Razorpay can't change the plan of some mandates (e.g. UPI AutoPay): say what to do instead.
      if (err.provider === "razorpay" && input.action === "change_plan" && err.status === 400) {
        throw errors.conflict("This payment method can't change plan. Cancel this plan, then subscribe to the new one.");
      }
      throw errors.internal("The payment provider didn't respond. Try again in a minute.");
    }
    throw err;
  }
}));
