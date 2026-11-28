// POST /functions/v1/manage-subscription (M9-B4/B5). Contract: packages/shared/src/api/billing.ts
// (ManageSubscriptionRequest → ManageSubscriptionResponse). Acts on the student's running monthly
// subscription or exam pack.
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
// Exam pack (paid once): no cancel. change_plan to the Platinum exam pack upgrades it for the days
// left: a one-time charge of the price difference × the share of the pack left, with the extra
// credits likewise (packUpgradeQuote). The answer is { checkout }: the app opens it like a purchase,
// and the webhook (upgrade_of in the metadata) moves the same pack to Platinum and adds the credits.
//
// The change is recorded here at once (billing_mark_*) so the app shows it; the provider's webhook
// confirms it and makes the plan change (billing_apply_event).

import { z } from "../_shared/deps.ts";
import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { ensureProviderPrice, MIN_UPGRADE_MINOR, packUpgradeQuote, paddle, PLAN_RANK, ProviderError, razorpay } from "../_shared/billing.ts";

// Same as ManageSubscriptionRequest (packages/shared/src/api/billing.ts).
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("portal") }).strict(),
  z.object({ action: z.literal("cancel") }).strict(),
  z.object({ action: z.literal("change_plan"), price_id: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/) }).strict(),
]);

type Offer = { id: string; plan_id: string | null };
type Prices = { enabled: boolean; subscriptions: Offer[]; exam_packs: Offer[] };

const COLUMNS =
  "id, plan_id, kind, provider, provider_subscription_id, provider_customer_id, status, current_period_start, current_period_end, cancel_at_period_end, scheduled_price_id, price_id, currency, amount_minor";

Deno.serve(createHandler({ name: "manage-subscription", auth: "required", input: Input }, async ({ input, user, admin }) => {
  const db = admin();
  const me = user!;

  const { data: subs, error } = await db.from("subscriptions").select(COLUMNS)
    .eq("user_id", me.id).in("kind", ["subscription", "exam_pack"]).in("status", ["active", "past_due"])
    .in("provider", ["razorpay", "paddle"])
    .order("current_period_end", { ascending: false }).limit(1);
  if (error) throw error;
  const sub = subs[0];
  if (!sub?.provider_subscription_id) throw errors.notFound("You don't have a plan to manage.");
  const pack = sub.kind === "exam_pack";

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

  /** Exam pack → a higher plan's exam pack for the days left: a one-time checkout. */
  const upgradePack = async () => {
    if (input.action !== "change_plan") throw errors.badRequest();
    const { data: profile } = await db.from("profiles").select("country_code, full_name").eq("id", me.id).maybeSingle();
    const { data: prices, error: gError } = await db.rpc("get_prices", { p_country: profile?.country_code ?? "" });
    if (gError) throw gError;
    const offer = (prices as unknown as Prices | null)?.exam_packs.find((o) => o.id === input.price_id);
    if (!offer) throw errors.priceNotAvailable();
    const { data: rows, error: pError } = await db.from("prices")
      .select("id, kind, plan_id, provider, provider_price_id, currency, amount_minor, credits")
      .in("id", [offer.id, sub.price_id ?? ""]);
    if (pError) throw pError;
    const target = rows.find((r) => r.id === offer.id);
    const current = rows.find((r) => r.id === sub.price_id);
    if (!target || !current) throw errors.priceNotAvailable();
    if (target.provider !== sub.provider) throw errors.conflict("This upgrade isn't available for how you paid.");
    if ((PLAN_RANK[target.plan_id!] ?? 0) <= (PLAN_RANK[sub.plan_id] ?? 0)) {
      throw errors.conflict("An exam pack can only be upgraded. It ends on its own date.");
    }
    if (target.currency !== current.currency) throw errors.conflict("This upgrade isn't available in your currency.");
    const quote = packUpgradeQuote({
      fromAmountMinor: sub.amount_minor ?? current.amount_minor,
      toAmountMinor: target.amount_minor,
      fromCredits: current.credits ?? 0,
      toCredits: target.credits ?? 0,
      start: sub.current_period_start,
      end: sub.current_period_end,
    });
    if (quote.amount_minor < MIN_UPGRADE_MINOR) throw errors.conflict("Your pack ends too soon to upgrade it.");

    const metadata = { user_id: me.id, price_id: target.id, upgrade_of: sub.id, upgrade_credits: String(quote.credits) };
    const name = `Upgrade to ${target.plan_id === "platinum" ? "Platinum" : "Gold"} exam pack (${quote.days_left} days left)`;
    if (sub.provider === "razorpay") {
      const rp = razorpay();
      const order = await rp.createOrder(quote.amount_minor, target.currency, `up:${sub.id.slice(0, 18)}`, metadata);
      return {
        checkout: {
          provider: "razorpay" as const,
          mode: "order" as const,
          order_id: order.id,
          price_id: target.id,
          key_id: rp.keyId,
          amount_minor: quote.amount_minor,
          currency: "INR" as const,
          description: name,
          prefill: { ...(profile?.full_name ? { name: profile.full_name } : {}), ...(me.email ? { email: me.email } : {}) },
        },
      };
    }
    const pd = paddle();
    const txn = await pd.createCustomTransaction(`Prepora: ${name}`, quote.amount_minor, target.currency, metadata);
    return { checkout: { provider: "paddle" as const, price_id: target.id, environment: pd.environment, client_token: pd.clientToken, transaction_id: txn.id } };
  };

  try {
    if (input.action === "portal") {
      if (sub.provider !== "paddle" || !sub.provider_customer_id) {
        throw errors.conflict("Manage this plan here: change plan or cancel.");
      }
      return { url: await paddle().portalUrl(sub.provider_customer_id, [sub.provider_subscription_id]) };
    }

    if (input.action === "cancel") {
      if (pack) throw errors.conflict("An exam pack is paid up front, so there's nothing to cancel. It ends on its own.");
      if (!sub.cancel_at_period_end) {
        if (sub.provider === "razorpay") await razorpay().cancelAtCycleEnd(sub.provider_subscription_id);
        else await paddle().cancelAtPeriodEnd(sub.provider_subscription_id);
        const { error: e } = await db.rpc("billing_mark_cancel", { p_subscription_id: sub.id });
        if (e) throw e;
      }
      return await summary(sub.id);
    }

    // change_plan
    if (pack) return await upgradePack();
    if (sub.cancel_at_period_end) throw errors.conflict("This plan is cancelled. Subscribe again after it ends.");
    const { data: profile } = await db.from("profiles").select("country_code").eq("id", me.id).maybeSingle();
    const { data: prices, error: gError } = await db.rpc("get_prices", { p_country: profile?.country_code ?? "" });
    if (gError) throw gError;
    const offer = (prices as unknown as Prices | null)?.subscriptions.find((o) => o.id === input.price_id);
    if (!offer) throw errors.priceNotAvailable();
    const { data: target, error: tError } = await db.from("prices")
      .select("id, kind, plan_id, provider, provider_price_id, currency, amount_minor, credits").eq("id", offer.id).single();
    if (tError) throw tError;
    if (target.provider !== sub.provider) throw errors.conflict("Cancel this plan and subscribe again to switch payment provider.");
    const targetProviderId = await ensureProviderPrice(db, target);
    if (!targetProviderId) throw errors.priceNotAvailable("This option isn't on sale yet.");
    const up = (PLAN_RANK[target.plan_id!] ?? 0) - (PLAN_RANK[sub.plan_id] ?? 0);
    if (up === 0) throw errors.conflict("You're already on this plan.");

    if (sub.provider === "razorpay") {
      await razorpay().changePlan(sub.provider_subscription_id, targetProviderId, up > 0 ? "now" : "cycle_end");
    } else {
      // Paddle changes the items at once: upgrades bill the prorated difference now; downgrades
      // aren't billed until the renewal, and billing_apply_event keeps the plan until then.
      await paddle().changePrice(sub.provider_subscription_id, targetProviderId, up > 0 ? "prorated_immediately" : "do_not_bill");
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
