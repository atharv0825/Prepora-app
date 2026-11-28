// Unit tests for the billing helpers (M9-B3): signatures and event normalisation.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { normalisePaddle, normaliseRazorpay, verifyPaddleSignature, verifyRazorpaySignature } from "./billing.ts";

function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

async function hmac(secret: string, message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message))), (b) => b.toString(16).padStart(2, "0")).join("");
}

const USER = "0b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d";
const body = JSON.stringify({ event: "order.paid", payload: {} });

// ── Signatures ──────────────────────────────────────────────────────────────────────────────
Deno.test("razorpay: a correct signature passes", async () => {
  assertEquals(await verifyRazorpaySignature(body, await hmac("whsec", body), "whsec"), true);
});

Deno.test("razorpay: a wrong secret, a changed body or no signature fails", async () => {
  const sig = await hmac("whsec", body);
  assertEquals(await verifyRazorpaySignature(body, sig, "other"), false);
  assertEquals(await verifyRazorpaySignature(body + " ", sig, "whsec"), false);
  assertEquals(await verifyRazorpaySignature(body, null, "whsec"), false);
  assertEquals(await verifyRazorpaySignature(body, sig, ""), false, "no secret configured = reject");
});

Deno.test("paddle: a correct, fresh signature passes (any h1 during rotation)", async () => {
  const ts = 1_800_000_000;
  const h1 = await hmac("pdl", `${ts}:${body}`);
  assertEquals(await verifyPaddleSignature(body, `ts=${ts};h1=${h1}`, "pdl", ts + 10), true);
  assertEquals(await verifyPaddleSignature(body, `ts=${ts};h1=deadbeef;h1=${h1}`, "pdl", ts), true);
});

Deno.test("paddle: stale, tampered or malformed signatures fail", async () => {
  const ts = 1_800_000_000;
  const h1 = await hmac("pdl", `${ts}:${body}`);
  assertEquals(await verifyPaddleSignature(body, `ts=${ts};h1=${h1}`, "pdl", ts + 301), false, "replayed later");
  assertEquals(await verifyPaddleSignature(body.replace("order", "x"), `ts=${ts};h1=${h1}`, "pdl", ts), false, "body changed");
  assertEquals(await verifyPaddleSignature(body, `ts=${ts + 1};h1=${h1}`, "pdl", ts), false, "timestamp changed");
  assertEquals(await verifyPaddleSignature(body, `h1=${h1}`, "pdl", ts), false, "no timestamp");
  assertEquals(await verifyPaddleSignature(body, null, "pdl", ts), false, "no header");
});

// ── Razorpay events ─────────────────────────────────────────────────────────────────────────
const rzpSub = (status: string) => ({
  entity: { id: "sub_1", plan_id: "plan_P", customer_id: "cust_1", status, current_start: 1_800_000_000, current_end: 1_802_592_000, notes: { user_id: USER, price_id: "in_gold_month" } },
});

Deno.test("razorpay subscription.charged → payment_completed with the plan id, period and payment", () => {
  const e = normaliseRazorpay("subscription.charged", {
    event: "subscription.charged",
    payload: { subscription: rzpSub("active"), payment: { entity: { id: "pay_1", amount: 59900, currency: "INR" } } },
  });
  assertEquals(e, {
    action: "payment_completed",
    user_id: USER,
    provider_price_id: "plan_P", // not the creation notes' price: it may have been upgraded since
    subscription_id: "sub_1",
    customer_id: "cust_1",
    payment_id: "pay_1",
    period_start: "2027-01-15T08:00:00.000Z",
    period_end: "2027-02-14T08:00:00.000Z",
    status: "active",
    amount_minor: 59900,
    currency: "INR",
  });
});

Deno.test("razorpay subscription.pending → past_due", () => {
  const e = normaliseRazorpay("subscription.pending", { payload: { subscription: rzpSub("pending") } });
  assertEquals([e.action, e.status, e.payment_id], ["subscription_past_due", "past_due", undefined]);
});

Deno.test("razorpay order.paid → payment_completed from the order's notes", () => {
  const e = normaliseRazorpay("order.paid", {
    payload: {
      order: { entity: { id: "order_7", amount_paid: 14900, currency: "INR", notes: { user_id: USER, price_id: "in_topup_50" } } },
      payment: { entity: { id: "pay_7", amount: 14900, currency: "INR", order_id: "order_7" } },
    },
  });
  assertEquals(e, { action: "payment_completed", user_id: USER, price_id: "in_topup_50", order_id: "order_7", payment_id: "pay_7", amount_minor: 14900, currency: "INR" });
});

Deno.test("razorpay refund.processed → refunded for the payment", () => {
  const e = normaliseRazorpay("refund.processed", { payload: { refund: { entity: { id: "rfnd_1", payment_id: "pay_7", amount: 14900, currency: "INR" } } } });
  assertEquals(e, { action: "refunded", payment_id: "pay_7", amount_minor: 14900, currency: "INR" });
});

Deno.test("razorpay: bad metadata is dropped, unknown events are ignored", () => {
  const e = normaliseRazorpay("order.paid", { payload: { order: { entity: { id: "order_8", notes: { user_id: "me", price_id: "x" } } } } });
  assertEquals([e.user_id, e.price_id], [undefined, undefined]);
  assertEquals(normaliseRazorpay("invoice.paid", {}).action, "ignored");
});

// ── Paddle events ───────────────────────────────────────────────────────────────────────────
Deno.test("paddle transaction.completed for a subscription → its current price and period", () => {
  const e = normalisePaddle("transaction.completed", {
    event_id: "evt_1",
    data: {
      id: "txn_1", subscription_id: "sub_P", customer_id: "ctm_1", custom_data: { user_id: USER, price_id: "sa_gold_month" },
      items: [{ price: { id: "pri_plat" }, quantity: 1 }],
      billing_period: { starts_at: "2027-01-01T00:00:00Z", ends_at: "2027-02-01T00:00:00Z" },
      details: { totals: { grand_total: "800", currency_code: "USD" } },
    },
  });
  assertEquals(e, {
    action: "payment_completed", user_id: USER, provider_price_id: "pri_plat", subscription_id: "sub_P", payment_id: "txn_1", customer_id: "ctm_1",
    period_start: "2027-01-01T00:00:00Z", period_end: "2027-02-01T00:00:00Z", amount_minor: 800, currency: "USD",
  });
});

Deno.test("paddle transaction.completed, one-time → the metadata's price", () => {
  const e = normalisePaddle("transaction.completed", {
    data: { id: "txn_9", subscription_id: null, custom_data: { user_id: USER, price_id: "sa_topup_150" }, items: [{ price: { id: "pri_t" } }], details: { totals: { grand_total: "499", currency_code: "USD" } } },
  });
  assertEquals([e.price_id, e.provider_price_id, e.payment_id, e.amount_minor], ["sa_topup_150", undefined, "txn_9", 499]);
});

Deno.test("paddle subscription.updated with a scheduled cancel → cancel_at_period_end", () => {
  const data = { id: "sub_P", status: "active", items: [{ price: { id: "pri_gold" } }], scheduled_change: { action: "cancel", effective_at: "2027-02-01T00:00:00Z" } };
  assertEquals(normalisePaddle("subscription.updated", { data }).cancel_at_period_end, true);
  assertEquals(normalisePaddle("subscription.updated", { data: { ...data, scheduled_change: null } }).cancel_at_period_end, false);
  assertEquals(normalisePaddle("subscription.created", { data }).cancel_at_period_end, undefined, "only updates state it");
});

Deno.test("paddle adjustments: only approved refunds and chargebacks refund", () => {
  const adj = (action: string, status: string) => normalisePaddle("adjustment.updated", { data: { action, status, transaction_id: "txn_9", totals: { total: "2199", currency_code: "USD" } } });
  assertEquals([adj("refund", "approved").action, adj("refund", "approved").payment_id, adj("refund", "approved").amount_minor], ["refunded", "txn_9", 2199]);
  assertEquals(adj("chargeback", "approved").action, "refunded");
  assertEquals(adj("refund", "pending_approval").action, "ignored");
  assertEquals(adj("credit", "approved").action, "ignored");
});
