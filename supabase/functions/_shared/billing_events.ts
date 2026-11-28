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
