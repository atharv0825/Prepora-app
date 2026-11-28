// Unit tests for the billing helpers (M9-B3): signatures and event normalisation.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import {
  ensureProviderPrice,
  normalisePaddle,
  normaliseRazorpay,
  type Paddle,
  providerPriceName,
  type Razorpay,
  verifyPaddleSignature,
  verifyRazorpaySignature,
} from "./billing.ts";
import { packUpgradeQuote } from "./billing_events.ts";

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

// ── Provider prices on first use ────────────────────────────────────────────────────────────

/** A fake prices table: update … where provider_price_id is null, then read back. */
function fakeDb(stored: { provider_price_id: string | null }) {
  const chain = {
    _update: null as null | Record<string, string>,
    from: () => chain,
    update(v: Record<string, string>) {
      chain._update = v;
      return chain;
    },
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    async maybeSingle() {
      if (chain._update && stored.provider_price_id === null) {
        stored.provider_price_id = chain._update.provider_price_id!;
        return { data: { provider_price_id: stored.provider_price_id }, error: null };
      }
      return { data: null, error: null };
    },
    async single() {
      return { data: { provider_price_id: stored.provider_price_id }, error: null };
    },
  };
  return chain;
}

const monthly = { id: "in_gold_month", kind: "subscription", plan_id: "gold", provider: "razorpay", provider_price_id: null, currency: "INR", amount_minor: 29900, credits: null };

Deno.test("ensureProviderPrice: an existing id is used as is", async () => {
  const calls: string[] = [];
  const rp = { createPlan: () => (calls.push("plan"), Promise.resolve({ id: "plan_new" })) } as unknown as Razorpay;
  assertEquals(await ensureProviderPrice(fakeDb({ provider_price_id: "plan_old" }), { ...monthly, provider_price_id: "plan_old" }, { razorpay: () => rp }), "plan_old");
  assertEquals(calls, []);
});

Deno.test("ensureProviderPrice: a Razorpay monthly price gets a plan, saved once", async () => {
  const seen: unknown[] = [];
  const rp = { createPlan: (...a: unknown[]) => (seen.push(a), Promise.resolve({ id: "plan_X" })) } as unknown as Razorpay;
  const stored = { provider_price_id: null as string | null };
  assertEquals(await ensureProviderPrice(fakeDb(stored), monthly, { razorpay: () => rp }), "plan_X");
  assertEquals(stored.provider_price_id, "plan_X");
  assertEquals(seen, [["Prepora Gold, monthly (in_gold_month)", 29900, "INR"]]);
});

Deno.test("ensureProviderPrice: Razorpay one-time orders need no price", async () => {
  assertEquals(await ensureProviderPrice(fakeDb({ provider_price_id: null }), { ...monthly, id: "in_topup_50", kind: "topup", plan_id: null, credits: 50 }), null);
});

Deno.test("ensureProviderPrice: a Paddle price is monthly only for subscriptions; a race keeps the first", async () => {
  const seen: unknown[] = [];
  const pd = { createPrice: (...a: unknown[]) => (seen.push(a), Promise.resolve({ id: "pri_mine" })) } as unknown as Paddle;
  const stored = { provider_price_id: "pri_theirs" as string | null }; // saved meanwhile by another request
  const pack = { ...monthly, id: "sa_gold_exam_pack", kind: "exam_pack", provider: "paddle", currency: "USD", amount_minor: 1099, credits: 300 };
  assertEquals(await ensureProviderPrice(fakeDb(stored), pack, { paddle: () => pd }), "pri_theirs");
  assertEquals(seen, [["Prepora Gold, 3-month exam pack (sa_gold_exam_pack)", 1099, "USD", false]]);
});

Deno.test("providerPriceName for a top-up", () => {
  assertEquals(providerPriceName({ id: "sa_topup_150", kind: "topup", plan_id: null, credits: 150 }), "Prepora 150 credits (sa_topup_150)");
});

// ── Exam pack upgrades ──────────────────────────────────────────────────────────────────────

Deno.test("packUpgradeQuote: the difference scaled by the share of the pack left", () => {
  const start = "2027-01-01T00:00:00Z";
  const end = "2027-04-01T00:00:00Z"; // 90 days
  const half = Date.parse(start) + 45 * 86_400_000;
  assertEquals(packUpgradeQuote({ fromAmountMinor: 79900, toAmountMinor: 169900, fromCredits: 300, toCredits: 660, start, end, now: half }), {
    amount_minor: 45000,
    credits: 180,
    days_left: 45,
  });
  assertEquals(packUpgradeQuote({ fromAmountMinor: 79900, toAmountMinor: 169900, fromCredits: 300, toCredits: 660, start, end, now: Date.parse(start) }).amount_minor, 90000);
  assertEquals(packUpgradeQuote({ fromAmountMinor: 79900, toAmountMinor: 169900, fromCredits: 300, toCredits: 660, start, end, now: Date.parse(end) + 1 }), { amount_minor: 0, credits: 0, days_left: 0 });
});

Deno.test("razorpay order.paid for a pack upgrade carries upgrade_of and the credits", () => {
  const of = "1b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d";
  const e = normaliseRazorpay("order.paid", {
    payload: {
      order: { entity: { id: "order_U", notes: { user_id: USER, price_id: "in_platinum_exam_pack", upgrade_of: of, upgrade_credits: "180" } } },
      payment: { entity: { id: "pay_U", amount: 45000, currency: "INR" } },
    },
  });
  assertEquals([e.price_id, e.upgrade_of, e.upgrade_credits, e.amount_minor], ["in_platinum_exam_pack", of, "180", 45000]);
  const bad = normaliseRazorpay("order.paid", { payload: { order: { entity: { id: "order_V", notes: { user_id: USER, upgrade_of: "x", upgrade_credits: "1e9" } } } } });
  assertEquals([bad.upgrade_of, bad.upgrade_credits], [undefined, undefined]);
});

Deno.test("paddle one-time transaction for a pack upgrade carries upgrade_of", () => {
  const of = "1b6a4c1e-2f5d-4a8b-9c3e-1d2f3a4b5c6d";
  const e = normalisePaddle("transaction.completed", {
    data: { id: "txn_U", subscription_id: null, custom_data: { user_id: USER, price_id: "sa_platinum_exam_pack", upgrade_of: of, upgrade_credits: "200" }, details: { totals: { grand_total: "600", currency_code: "USD" } } },
  });
  assertEquals([e.price_id, e.upgrade_of, e.upgrade_credits, e.payment_id], ["sa_platinum_exam_pack", of, "200", "txn_U"]);
});
