import { describe, expect, it } from "vitest";
import {
  CheckoutMetadata,
  CreateCheckoutRequest,
  CreateCheckoutResponse,
  billingAction,
  billingActions,
  billingErrorMessages,
  billingErrorStatus,
  billingEventActions,
  checkoutProviders,
} from "./billing";

const razorpayBase = {
  provider: "razorpay",
  price_id: "in_gold_month",
  key_id: "rzp_test_AbC123",
  amount_minor: 29900,
  currency: "INR",
  description: "Gold, monthly",
  prefill: { name: "Asha", email: "asha@example.com" },
};

describe("CreateCheckoutRequest", () => {
  it("takes a price id only", () => {
    expect(CreateCheckoutRequest.parse({ price_id: "sa_topup_150" })).toEqual({ price_id: "sa_topup_150" });
  });

  it.each([
    ["an empty id", { price_id: "" }],
    ["upper case", { price_id: "IN_GOLD_MONTH" }],
    ["SQL-ish text", { price_id: "x'; drop table prices" }],
    ["a client-chosen amount", { price_id: "in_gold_month", amount_minor: 1 }],
    ["a client-chosen country", { price_id: "in_gold_month", country: "IN" }],
  ])("rejects %s", (_label, value) => {
    expect(CreateCheckoutRequest.safeParse(value).success).toBe(false);
  });
});

describe("CreateCheckoutResponse", () => {
  it("accepts a Razorpay subscription", () => {
    const r = CreateCheckoutResponse.parse({ ...razorpayBase, mode: "subscription", subscription_id: "sub_Nx1" });
    expect(r.provider === "razorpay" && r.mode).toBe("subscription");
  });

  it("accepts a Razorpay order (exam pack, top-up)", () => {
    const r = CreateCheckoutResponse.parse({ ...razorpayBase, price_id: "in_topup_50", amount_minor: 14900, mode: "order", order_id: "order_Q9" });
    expect(r.provider === "razorpay" && r.mode === "order" && r.order_id).toBe("order_Q9");
  });

  it("accepts a Paddle transaction", () => {
    const r = CreateCheckoutResponse.parse({
      provider: "paddle",
      price_id: "sea_gold_month",
      environment: "sandbox",
      client_token: "test_7d3f9",
      transaction_id: "txn_01h",
    });
    expect(r.provider).toBe("paddle");
  });

  it.each([
    ["a Razorpay secret instead of the key id", { ...razorpayBase, key_id: "secret_x", mode: "order", order_id: "order_1" }],
    ["a Razorpay order without its id", { ...razorpayBase, mode: "order" }],
    ["a subscription with an order id", { ...razorpayBase, mode: "subscription", order_id: "order_1" }],
    ["Razorpay in another currency", { ...razorpayBase, currency: "USD", mode: "order", order_id: "order_1" }],
    ["a Paddle API key instead of the client token", { provider: "paddle", price_id: "sa_gold_month", environment: "production", client_token: "pdl_live_apikey_1", transaction_id: "txn_1" }],
    ["an unknown provider", { provider: "stripe", price_id: "sa_gold_month" }],
  ])("rejects %s", (_label, value) => {
    expect(CreateCheckoutResponse.safeParse(value).success).toBe(false);
  });
});

describe("CheckoutMetadata", () => {
  it("carries the buyer and the price", () => {
    const m = { user_id: "0b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d", price_id: "in_gold_month" };
    expect(CheckoutMetadata.parse(m)).toEqual(m);
    expect(CheckoutMetadata.safeParse({ ...m, user_id: "me" }).success).toBe(false);
  });
});

describe("billing errors", () => {
  it("every code has a status and a message", () => {
    expect(Object.keys(billingErrorStatus).sort()).toEqual(Object.keys(billingErrorMessages).sort());
    expect(billingErrorStatus.already_subscribed).toBe(409);
  });
});

describe("webhook event mapping", () => {
  it("maps only to known actions", () => {
    for (const provider of checkoutProviders) {
      for (const action of Object.values(billingEventActions[provider])) expect(billingActions).toContain(action);
    }
  });

  it("every action but ignored is reachable from both providers", () => {
    for (const provider of checkoutProviders) {
      const used = new Set(Object.values(billingEventActions[provider]));
      for (const action of billingActions) if (action !== "ignored") expect(used, `${provider}: ${action}`).toContain(action);
    }
  });

  it.each([
    ["razorpay", "subscription.charged", "payment_completed"],
    ["razorpay", "order.paid", "payment_completed"],
    ["razorpay", "subscription.pending", "subscription_past_due"],
    ["razorpay", "subscription.halted", "subscription_ended"],
    ["paddle", "transaction.completed", "payment_completed"],
    ["paddle", "subscription.canceled", "subscription_ended"],
    ["paddle", "adjustment.updated", "refunded"],
  ] as const)("%s %s → %s", (provider, event, action) => {
    expect(billingAction(provider, event)).toBe(action);
  });

  it("ignores unknown events, including ones named like object keys", () => {
    expect(billingAction("razorpay", "invoice.paid")).toBe("ignored");
    expect(billingAction("paddle", "toString")).toBe("ignored");
    expect(billingAction("paddle", "__proto__")).toBe("ignored");
  });
});
