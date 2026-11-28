// Billing contract (M9-C2). Shared by the web app (pricing, checkout) and the billing Edge
// Functions: create-checkout (M9-B2) and billing-webhook (M9-B3).
//
// Tables: prices, subscriptions, payment_events (M9-C1). India pays through Razorpay, every other
// country through Paddle. The client sends only a price id; the function works out the country
// (CF-IPCountry and the profile), checks the price is on sale there and returns what the
// provider's checkout needs. Plans and credits change only from verified webhooks.
import { z } from "zod";
import { Constants } from "../db";
import type { ApiErrorCode } from "./errors";

const Enums = Constants.public.Enums;

// ── Enums (mirror the database) ─────────────────────────────────────────────────────────────
export const priceKinds = Enums.price_kind;
export type PriceKind = (typeof priceKinds)[number];
export const PriceKind = z.enum(priceKinds);

export const billingPeriods = Enums.billing_period;
export type BillingPeriod = (typeof billingPeriods)[number];

export const subscriptionStatuses = Enums.subscription_status;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

/** Providers a web checkout can use (prices.provider). The others are for later (mobile, manual). */
export const checkoutProviders = ["razorpay", "paddle"] as const satisfies readonly (typeof Enums.payment_provider)[number][];
export type CheckoutProvider = (typeof checkoutProviders)[number];
export const CheckoutProvider = z.enum(checkoutProviders);

// ── create-checkout ─────────────────────────────────────────────────────────────────────────
/** prices.id: a stable slug such as in_gold_month (same rule as the database check). */
export const PriceId = z.string().regex(/^[a-z][a-z0-9_]{2,59}$/, "Unknown price.");

export const CreateCheckoutRequest = z.object({ price_id: PriceId }).strict();
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequest>;

const currency = z.string().regex(/^[A-Z]{3}$/);
const amountMinor = z.number().int().positive();

/**
 * Razorpay (India). Opens Razorpay Checkout with `key_id` and either a subscription (monthly plans,
 * UPI AutoPay or card mandate) or an order (exam packs and top-ups, paid once).
 */
const RazorpayBase = z.object({
  provider: z.literal("razorpay"),
  price_id: PriceId,
  /** The public key id (rzp_test_… / rzp_live_…), never the secret. */
  key_id: z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/),
  amount_minor: amountMinor,
  currency: z.literal("INR"),
  /** Shown in the checkout, e.g. "Gold, monthly". */
  description: z.string().min(1).max(255),
  prefill: z.object({ name: z.string().max(100).optional(), email: z.email().optional() }).strict(),
});

export const RazorpayCheckout = z.discriminatedUnion("mode", [
  RazorpayBase.extend({ mode: z.literal("subscription"), subscription_id: z.string().regex(/^sub_[A-Za-z0-9]+$/) }).strict(),
  RazorpayBase.extend({ mode: z.literal("order"), order_id: z.string().regex(/^order_[A-Za-z0-9]+$/) }).strict(),
]);
export type RazorpayCheckout = z.infer<typeof RazorpayCheckout>;

/**
 * Paddle (every other country). Paddle.js is initialised with the client-side token and opens the
 * overlay checkout for the transaction; Paddle shows the local currency and handles tax.
 */
export const PaddleCheckout = z
  .object({
    provider: z.literal("paddle"),
    price_id: PriceId,
    environment: z.enum(["sandbox", "production"]),
    /** Paddle client-side token (test_… / live_…): safe in the browser. */
    client_token: z.string().regex(/^(test|live)_[A-Za-z0-9]+$/),
    transaction_id: z.string().regex(/^txn_[A-Za-z0-9]+$/),
  })
  .strict();
export type PaddleCheckout = z.infer<typeof PaddleCheckout>;

/** create-checkout's response: the provider's checkout data. */
export const CreateCheckoutResponse = z.union([RazorpayCheckout, PaddleCheckout]);
export type CreateCheckoutResponse = z.infer<typeof CreateCheckoutResponse>;

/**
 * Attached to every checkout (Razorpay `notes`, Paddle `custom_data`) and sent back in its
 * webhooks, so billing-webhook knows whose purchase it is and what was bought.
 */
export const CheckoutMetadata = z
  .object({
    user_id: z.uuid(),
    price_id: PriceId,
    /** Exam pack upgrades only: the pack (subscriptions.id) being upgraded and the extra credits. */
    upgrade_of: z.uuid().optional(),
    /** Razorpay plan changes only: the subscription (sub_…) the new one replaces. */
    replaces: z.string().regex(/^sub_[A-Za-z0-9]+$/).optional(),
    upgrade_credits: z.string().regex(/^\d{1,5}$/).optional(),
  })
  .strict();
export type CheckoutMetadata = z.infer<typeof CheckoutMetadata>;

// ── create-checkout errors ──────────────────────────────────────────────────────────────────
/**
 * price_not_available: unknown, inactive, or not sold in the student's country.
 * already_subscribed: a monthly plan or exam pack is already running (changing plan is M9-B4).
 */
export const billingErrorCodes = ["price_not_available", "already_subscribed"] as const satisfies readonly ApiErrorCode[];
export type BillingErrorCode = (typeof billingErrorCodes)[number];

export const billingErrorStatus: Record<BillingErrorCode, number> = {
  price_not_available: 422,
  already_subscribed: 409,
};

export const billingErrorMessages: Record<BillingErrorCode, string> = {
  price_not_available: "This option isn't available in your country. Refresh the page to see current prices.",
  already_subscribed: "You already have a plan. Manage it in Settings.",
};

// ── Webhooks: provider event → our action ───────────────────────────────────────────────────
/**
 * What billing-webhook does with an event (M9-B3). Every event is stored in payment_events first.
 *   subscription_started  create or update the subscription as active; set profiles.plan
 *   payment_completed     money received: grant what the price buys (decided by its kind):
 *                         a subscription period → extend it and grant the monthly credits;
 *                         an exam pack → 3 months of the plan and its credits; a top-up → credits
 *   subscription_updated  plan change or scheduled cancellation: copy plan, period, cancel_at_period_end
 *   subscription_past_due a renewal failed: past_due, plan kept during the grace period
 *   subscription_ended    cancelled or ran out: status cancelled/expired, back to Free
 *   refunded              refund the purchase: remove the credits it granted that are still unspent
 *   subscription_replaced Razorpay plan change: the student authorised the new subscription that
 *                         replaces the old one (not in the table: billing-webhook derives it from
 *                         subscription.authenticated with notes.replaces)
 *   ignored               stored, nothing else to do
 */
export const billingActions = [
  "subscription_started",
  "payment_completed",
  "subscription_updated",
  "subscription_past_due",
  "subscription_ended",
  "refunded",
  "subscription_replaced",
  "ignored",
] as const;
export type BillingAction = (typeof billingActions)[number];

/**
 * The mapping table. Events not listed are ignored (stored only).
 * Razorpay: subscriptions for monthly plans, orders for exam packs and top-ups.
 * Paddle Billing: transaction.completed covers first payments, renewals and one-time purchases;
 * a scheduled cancellation arrives as subscription.updated; refunds are adjustments (act only on
 * an approved refund).
 */
export const billingEventActions: Record<CheckoutProvider, Readonly<Record<string, BillingAction>>> = {
  razorpay: {
    "subscription.authenticated": "ignored", // mandate set up, nothing charged yet
    "subscription.activated": "subscription_started",
    "subscription.charged": "payment_completed", // every successful charge, the first one too
    "subscription.updated": "subscription_updated",
    "subscription.pending": "subscription_past_due", // a charge failed, Razorpay retries
    "subscription.halted": "subscription_ended", // every retry failed
    "subscription.cancelled": "subscription_ended",
    "subscription.completed": "subscription_ended",
    "order.paid": "payment_completed", // exam packs and top-ups
    "payment.failed": "ignored", // a one-time payment failed: nothing was granted
    "refund.processed": "refunded",
  },
  paddle: {
    "subscription.created": "subscription_started",
    "subscription.activated": "subscription_started",
    "transaction.completed": "payment_completed",
    "subscription.updated": "subscription_updated",
    "subscription.past_due": "subscription_past_due",
    "subscription.canceled": "subscription_ended", // Paddle's canceled = ended (scheduled ones come as updated)
    "transaction.payment_failed": "ignored", // subscription.past_due covers renewals
    "adjustment.created": "refunded",
    "adjustment.updated": "refunded",
  },
};

/** The action for a webhook event; unknown events are ignored. */
export function billingAction(provider: CheckoutProvider, eventType: string): BillingAction {
  return Object.hasOwn(billingEventActions[provider], eventType) ? billingEventActions[provider][eventType]! : "ignored";
}

// ── get_prices (M9-B1) ──────────────────────────────────────────────────────────────────────
const PlanId = z.enum(["gold", "platinum"]);

/** One thing on sale in the student's country (a row of prices, resolved for that country). */
export const Offer = z
  .object({
    id: PriceId,
    plan_id: PlanId.nullable(),
    period: z.enum(billingPeriods).nullable(),
    credits: z.number().int().positive().nullable(),
    currency,
    amount_minor: amountMinor,
  })
  .strict();
export type Offer = z.infer<typeof Offer>;

/**
 * get_prices(country): null when the country isn't listed. enabled = launched there (checkout
 * needs it). Monthly plans and exam packs come Gold first; top-ups smallest first.
 */
export const GetPricesResult = z
  .object({
    country: z.string().regex(/^[A-Z]{2}$/),
    region: z.enum(Enums.market_region),
    enabled: z.boolean(),
    provider: CheckoutProvider.nullable(),
    subscriptions: z.array(Offer),
    exam_packs: z.array(Offer),
    topups: z.array(Offer),
  })
  .strict()
  .nullable();
export type GetPricesResult = z.infer<typeof GetPricesResult>;

// ── manage-subscription (M9-B4/B5) ──────────────────────────────────────────────────────────
/** Students change plan; they can't cancel (support ends plans from the admin panel). */
export const ManageSubscriptionRequest = z.discriminatedUnion("action", [
  /** Paddle's customer portal (payment method, invoices). Razorpay has none: 409 conflict. */
  z.object({ action: z.literal("portal") }).strict(),
  /**
   * Monthly: upgrade at once (credit difference granted) or downgrade from the period end.
   * Exam pack: upgrade to a higher plan's exam pack for the days left (answer: { checkout }).
   */
  z.object({ action: z.literal("change_plan"), price_id: PriceId }).strict(),
]);
export type ManageSubscriptionRequest = z.infer<typeof ManageSubscriptionRequest>;

export const SubscriptionSummary = z
  .object({
    id: z.uuid(),
    plan_id: PlanId,
    provider: CheckoutProvider,
    status: z.enum(subscriptionStatuses),
    current_period_end: z.string(),
    cancel_at_period_end: z.boolean(),
    /** A downgrade booked for the period end. */
    scheduled_plan_id: PlanId.nullable(),
  })
  .strict();
export type SubscriptionSummary = z.infer<typeof SubscriptionSummary>;

export const ManageSubscriptionResponse = z.union([
  z.object({ url: z.url() }).strict(),
  z.object({ subscription: SubscriptionSummary }).strict(),
  /** An exam pack upgrade: pay the difference in the provider's checkout, like a purchase. */
  z.object({ checkout: CreateCheckoutResponse }).strict(),
]);
export type ManageSubscriptionResponse = z.infer<typeof ManageSubscriptionResponse>;

// ── Money ───────────────────────────────────────────────────────────────────────────────────
/**
 * An amount in a currency's minor unit, for people: 29900 INR → "₹299", 1099 USD → "$10.99",
 * 1500 JPY → "JP¥1,500" (the exponent comes from Intl, so zero-decimal currencies work).
 */
export function formatMoney(amountMinor: number, currency: string, locale = "en-IN"): string {
  const base = new Intl.NumberFormat(locale, { style: "currency", currency });
  const digits = base.resolvedOptions().maximumFractionDigits ?? 2;
  const value = amountMinor / 10 ** digits;
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}

// ── Checkout success (M9-F2) ────────────────────────────────────────────────────────────────
/**
 * Has the webhook landed? The success page polls until it has: a plan purchase is done when the
 * profile shows that plan; a top-up when a top-up bucket appeared after checkout started.
 */
export function purchaseConfirmed(
  bought: { kind: "subscription" | "exam_pack" | "topup"; plan_id: string | null },
  now: { plan: string; topupSince: boolean },
): boolean {
  return bought.kind === "topup" ? now.topupSince : now.plan === bought.plan_id;
}

// ── Exam pack upgrade (Settings) ────────────────────────────────────────────────────────────
/**
 * Upgrading an exam pack (Gold → Platinum) for the days it has left: the price difference and the
 * extra credits, both scaled by the share of the pack still to run. manage-subscription charges
 * this (its copy: supabase/functions/_shared/billing_events.ts, compared in tests/contract.test.ts).
 */
export function packUpgradeQuote(q: {
  fromAmountMinor: number;
  toAmountMinor: number;
  fromCredits: number;
  toCredits: number;
  start: string;
  end: string;
  now?: number;
}): { amount_minor: number; credits: number; days_left: number } {
  const start = Date.parse(q.start);
  const end = Date.parse(q.end);
  const now = q.now ?? Date.now();
  const total = Math.max(end - start, 1);
  const left = Math.min(Math.max(end - now, 0), total);
  const share = left / total;
  return {
    amount_minor: Math.max(0, Math.round((q.toAmountMinor - q.fromAmountMinor) * share)),
    credits: Math.max(0, Math.round((q.toCredits - q.fromCredits) * share)),
    days_left: Math.ceil(left / 86_400_000),
  };
}

/** Below this (in minor units) an upgrade isn't charged: too close to the pack's end. */
export const MIN_UPGRADE_MINOR = 100;
