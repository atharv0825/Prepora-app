// POST /functions/v1/create-checkout (M9-B2). Contract: packages/shared/src/api/billing.ts
// (CreateCheckoutRequest → CreateCheckoutResponse).
//
//   1. The price must be on sale in the student's country (profiles.country_code, set at
//      onboarding from the IP country; Paddle confirms the billing address): get_prices(). Else
//      422 price_not_available. The country must be open (launched).
//   2. A monthly plan or exam pack can't be bought on top of a running one (409
//      already_subscribed: changing plan is manage-subscription). Top-ups can always be bought.
//   3. India (Razorpay): a subscription for monthly plans, an order for exam packs and top-ups.
//      Everyone else (Paddle): a transaction, opened in Paddle's overlay checkout.
//      The provider's price (Razorpay plan, Paddle price) is created on first use
//      (ensureProviderPrice) and saved in prices.provider_price_id.
//   4. { user_id, price_id } travels with the checkout (notes / custom_data), so billing-webhook
//      knows whose purchase it is. Nothing is granted here: only verified webhooks grant.

import { z } from "../_shared/deps.ts";
import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { ensureProviderPrice, paddle, ProviderError, razorpay } from "../_shared/billing.ts";

// Same as CreateCheckoutRequest (packages/shared/src/api/billing.ts).
const Input = z.object({ price_id: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/) }).strict();

type Offer = { id: string; plan_id: string | null; period: string | null; credits: number | null; currency: string; amount_minor: number };
type Prices = { country: string; enabled: boolean; provider: "razorpay" | "paddle"; subscriptions: Offer[]; exam_packs: Offer[]; topups: Offer[] };

const PLAN_NAME: Record<string, string> = { gold: "Gold", platinum: "Platinum" };

Deno.serve(createHandler({ name: "create-checkout", auth: "required", input: Input }, async ({ input, user, admin }) => {
  const db = admin();
  const me = user!;

  const { data: profile, error: pError } = await db.from("profiles").select("country_code, full_name").eq("id", me.id).maybeSingle();
  if (pError) throw pError;
  if (!profile?.country_code) throw errors.priceNotAvailable("Set your country in Settings first.");

  const { data: prices, error: gError } = await db.rpc("get_prices", { p_country: profile.country_code });
  if (gError) throw gError;
  const sale = prices as unknown as Prices | null;
  if (!sale?.enabled) throw errors.priceNotAvailable();
  const offer = [...sale.subscriptions, ...sale.exam_packs, ...sale.topups].find((o) => o.id === input.price_id);
  if (!offer) throw errors.priceNotAvailable();

  const { data: price, error: rError } = await db.from("prices")
    .select("id, kind, plan_id, provider, provider_price_id, currency, amount_minor, credits")
    .eq("id", offer.id).single();
  if (rError) throw rError;

  if (price.kind !== "topup") {
    // Running = still giving access (active, or past_due within its grace period).
    const { data: live, error: sError } = await db.from("subscriptions").select("id")
      .eq("user_id", me.id).in("status", ["active", "past_due"])
      .gt("current_period_end", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1);
    if (sError) throw sError;
    if (live.length > 0) throw errors.alreadySubscribed("You already have a plan. Change or cancel it in Settings.");
  }

  const metadata = { user_id: me.id, price_id: price.id };
  const description = price.kind === "topup"
    ? `${price.credits} credits`
    : `${PLAN_NAME[price.plan_id!]}, ${price.kind === "exam_pack" ? "3-month exam pack" : "monthly"}`;

  try {
    if (price.provider === "razorpay") {
      const rp = razorpay();
      const base = {
        provider: "razorpay" as const,
        price_id: price.id,
        key_id: rp.keyId,
        amount_minor: price.amount_minor,
        currency: "INR" as const,
        description,
        prefill: { ...(profile.full_name ? { name: profile.full_name } : {}), ...(me.email ? { email: me.email } : {}) },
      };
      if (price.kind === "subscription") {
        const planId = await ensureProviderPrice(db, price, { razorpay: () => rp });
        if (!planId) throw notSetUp(price.id);
        const sub = await rp.createSubscription(planId, metadata);
        return { ...base, mode: "subscription", subscription_id: sub.id };
      }
      const order = await rp.createOrder(price.amount_minor, price.currency, `${price.id}:${me.id.slice(0, 8)}`, metadata);
      return { ...base, mode: "order", order_id: order.id };
    }

    const pd = paddle();
    const paddlePriceId = await ensureProviderPrice(db, price, { paddle: () => pd });
    if (!paddlePriceId) throw notSetUp(price.id);
    const txn = await pd.createTransaction(paddlePriceId, metadata);
    return { provider: "paddle", price_id: price.id, environment: pd.environment, client_token: pd.clientToken, transaction_id: txn.id };
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(`[create-checkout] ${err.provider} ${err.status} for ${price.id}`);
      throw errors.internal("The payment provider didn't respond. Try again in a minute.");
    }
    throw err;
  }
}));

/** A price the provider has no product for, and none could be made. */
function notSetUp(priceId: string) {
  console.error(`[create-checkout] ${priceId} has no provider_price_id`);
  return errors.priceNotAvailable("This option isn't on sale yet.");
}
