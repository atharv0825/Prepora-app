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
  GetPricesResult,
  ManageSubscriptionRequest,
  ManageSubscriptionResponse,
  formatMoney,
  purchaseConfirmed,
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
      // subscription_replaced comes from Razorpay's subscription.authenticated with notes.replaces.
      for (const action of billingActions) if (action !== "ignored" && action !== "subscription_replaced") expect(used, `${provider}: ${action}`).toContain(action);
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

describe("GetPricesResult", () => {
  const offer = { id: "in_gold_month", plan_id: "gold", period: "month", credits: null, currency: "INR", amount_minor: 29900 };
  it("accepts get_prices output and null", () => {
    expect(GetPricesResult.parse({ country: "IN", region: "IN", enabled: true, provider: "razorpay", subscriptions: [offer], exam_packs: [], topups: [] })?.subscriptions[0]?.id).toBe("in_gold_month");
    expect(GetPricesResult.parse(null)).toBeNull();
  });
  it("rejects a Free offer", () => {
    expect(GetPricesResult.safeParse({ country: "IN", region: "IN", enabled: true, provider: "razorpay", subscriptions: [{ ...offer, plan_id: "free" }], exam_packs: [], topups: [] }).success).toBe(false);
  });
});

describe("manage-subscription", () => {
  it("takes portal, cancel or change_plan with a price", () => {
    expect(ManageSubscriptionRequest.parse({ action: "cancel" })).toEqual({ action: "cancel" });
    expect(ManageSubscriptionRequest.safeParse({ action: "change_plan" }).success).toBe(false);
    expect(ManageSubscriptionRequest.safeParse({ action: "refund" }).success).toBe(false);
  });
  it("answers with a portal url or the subscription", () => {
    expect(ManageSubscriptionResponse.safeParse({ url: "https://sandbox-customer-portal.paddle.com/x" }).success).toBe(true);
    const subscription = {
      id: "0b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d", plan_id: "platinum", provider: "razorpay", status: "active",
      current_period_end: "2027-02-01T00:00:00Z", cancel_at_period_end: false, scheduled_plan_id: "gold",
    };
    expect(ManageSubscriptionResponse.safeParse({ subscription }).success).toBe(true);
  });
});

describe("formatMoney", () => {
  it.each([
    [29900, "INR", "₹299"],
    [169900, "INR", "₹1,699"],
    [1099, "USD", "$10.99"],
    [1300, "NZD", "NZ$13"],
    [1500, "JPY", "JP¥1,500"],
  ])("%i %s → %s", (amount, currency, out) => {
    expect(formatMoney(amount, currency)).toBe(out);
  });
});

describe("purchaseConfirmed", () => {
  it("a plan: when the profile shows it; a top-up: when its bucket appears", () => {
    expect(purchaseConfirmed({ kind: "subscription", plan_id: "gold" }, { plan: "free", topupSince: false })).toBe(false);
    expect(purchaseConfirmed({ kind: "exam_pack", plan_id: "platinum" }, { plan: "platinum", topupSince: false })).toBe(true);
    expect(purchaseConfirmed({ kind: "topup", plan_id: null }, { plan: "gold", topupSince: false })).toBe(false);
    expect(purchaseConfirmed({ kind: "topup", plan_id: null }, { plan: "free", topupSince: true })).toBe(true);
  });
});
