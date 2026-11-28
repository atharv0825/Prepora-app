// Webhook event → our action (M9-C2). Copy of billingEventActions in
// packages/shared/src/api/billing.ts; tests/contract.test.ts imports this file and checks they
// match. No imports here, so the Node test runner can load it.

export type BillingAction =
  | "subscription_started"
  | "payment_completed"
  | "subscription_updated"
  | "subscription_past_due"
  | "subscription_ended"
  | "refunded"
  | "ignored";

export type CheckoutProvider = "razorpay" | "paddle";

export const BILLING_EVENT_ACTIONS: Record<CheckoutProvider, Readonly<Record<string, BillingAction>>> = {
  razorpay: {
    "subscription.authenticated": "ignored",
    "subscription.activated": "subscription_started",
    "subscription.charged": "payment_completed",
    "subscription.updated": "subscription_updated",
    "subscription.pending": "subscription_past_due",
    "subscription.halted": "subscription_ended",
    "subscription.cancelled": "subscription_ended",
    "subscription.completed": "subscription_ended",
    "order.paid": "payment_completed",
    "payment.failed": "ignored",
    "refund.processed": "refunded",
  },
  paddle: {
    "subscription.created": "subscription_started",
    "subscription.activated": "subscription_started",
    "transaction.completed": "payment_completed",
    "subscription.updated": "subscription_updated",
    "subscription.past_due": "subscription_past_due",
    "subscription.canceled": "subscription_ended",
    "transaction.payment_failed": "ignored",
    "adjustment.created": "refunded",
    "adjustment.updated": "refunded",
  },
};

export function billingAction(provider: CheckoutProvider, eventType: string): BillingAction {
  return Object.hasOwn(BILLING_EVENT_ACTIONS[provider], eventType) ? BILLING_EVENT_ACTIONS[provider][eventType]! : "ignored";
}

/**
 * Upgrading an exam pack (Gold → Platinum) for the days it has left: the price difference and the
 * extra credits, both scaled by the share of the pack still to run. Copy of packUpgradeQuote in
 * packages/shared/src/api/billing.ts (tests/contract.test.ts compares them).
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

/** Below this (in minor units) an upgrade isn't worth charging: Razorpay's minimum is ₹1. */
export const MIN_UPGRADE_MINOR = 100;
