// Billing helpers for create-checkout, billing-webhook and manage-subscription (M9-B2…B5):
// webhook signature checks, turning each provider's event into the normalised event that
// public.billing_apply_event() takes, and small Razorpay / Paddle API clients.
//
// Secrets (Supabase Edge Function secrets, never in the web app):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
//   PADDLE_API_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_CLIENT_TOKEN, PADDLE_ENV (sandbox | production)

import { type BillingAction, billingAction, type CheckoutProvider } from "./billing_events.ts";

export type { BillingAction, CheckoutProvider };

// ── Signatures ──────────────────────────────────────────────────────────────────────────────
const encoder = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Razorpay: X-Razorpay-Signature = hex HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyRazorpaySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  return sameHex(await hmacHex(secret, rawBody), signature.trim().toLowerCase());
}

/**
 * Paddle: Paddle-Signature = "ts=<unix>;h1=<hex>" (several h1 while a secret is rotated), the hex
 * HMAC-SHA256 of "<ts>:<raw body>". Older than `toleranceSec` = a replay, rejected.
 */
export async function verifyPaddleSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(";").map((p) => p.trim().split("="));
  const ts = parts.find(([k]) => k === "ts")?.[1];
  const h1s = parts.filter(([k]) => k === "h1").map(([, v]) => (v ?? "").toLowerCase());
  if (!ts || !/^\d+$/.test(ts) || h1s.length === 0) return false;
  if (Math.abs(nowSec - Number(ts)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${ts}:${rawBody}`);
  return h1s.some((h) => sameHex(expected, h));
}

// ── Normalised events ───────────────────────────────────────────────────────────────────────
/** What public.billing_apply_event() takes (see its migration for each key). */
export interface NormalisedEvent {
  action: BillingAction;
  user_id?: string;
  price_id?: string;
  provider_price_id?: string;
  subscription_id?: string;
  order_id?: string;
  payment_id?: string;
  customer_id?: string;
  period_start?: string;
  period_end?: string;
  status?: "active" | "past_due" | "cancelled";
  cancel_at_period_end?: boolean;
  amount_minor?: number;
  currency?: string;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const int = (v: unknown): number | undefined => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRICE_ID = /^[a-z][a-z0-9_]{2,59}$/;

/** Checkout metadata (Razorpay notes / Paddle custom_data): { user_id, price_id }, if valid. */
function metadata(...sources: unknown[]): { user_id?: string; price_id?: string } {
  for (const s of sources) {
    const m = obj(s);
    const user = str(m.user_id);
    const price = str(m.price_id);
    if (user && UUID.test(user)) return { user_id: user, price_id: price && PRICE_ID.test(price) ? price : undefined };
  }
  return {};
}

const unixIso = (v: unknown) => (int(v) ? new Date(int(v)! * 1000).toISOString() : undefined);

/** Drops undefined keys (the database reads absent keys as "not stated"). */
function clean(e: NormalisedEvent): NormalisedEvent {
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)) as unknown as NormalisedEvent;
}

/**
 * A Razorpay webhook. Subscriptions: the plan id identifies the price (after an upgrade the
 * creation notes are out of date), the notes identify the student. Orders: the notes carry both.
 */
export function normaliseRazorpay(eventType: string, payload: unknown): NormalisedEvent {
  const action = billingAction("razorpay", eventType);
  const p = obj(obj(payload).payload);
  const sub = obj(obj(p.subscription).entity);
  const pay = obj(obj(p.payment).entity);
  const order = obj(obj(p.order).entity);
  const refund = obj(obj(p.refund).entity);

  if (action === "refunded") {
    return clean({ action, payment_id: str(refund.payment_id), amount_minor: int(refund.amount), currency: str(refund.currency)?.toUpperCase() });
  }
  if (eventType.startsWith("subscription.")) {
    const meta = metadata(sub.notes);
    const status = str(sub.status);
    return clean({
      action,
      user_id: meta.user_id,
      provider_price_id: str(sub.plan_id),
      price_id: str(sub.plan_id) ? undefined : meta.price_id,
      subscription_id: str(sub.id),
      customer_id: str(sub.customer_id),
      payment_id: action === "payment_completed" ? str(pay.id) : undefined,
      period_start: unixIso(sub.current_start),
      period_end: unixIso(sub.current_end),
      status: status === "active" ? "active" : status === "pending" ? "past_due" : undefined,
      amount_minor: action === "payment_completed" ? int(pay.amount) : undefined,
      currency: action === "payment_completed" ? str(pay.currency)?.toUpperCase() : undefined,
    });
  }
  // order.paid (exam packs and top-ups), payment.failed
  const meta = metadata(order.notes, pay.notes);
  return clean({
    action,
    user_id: meta.user_id,
    price_id: meta.price_id,
    order_id: str(order.id) ?? str(pay.order_id),
    payment_id: str(pay.id),
    customer_id: str(pay.customer_id),
    amount_minor: int(pay.amount) ?? int(order.amount_paid),
    currency: (str(pay.currency) ?? str(order.currency))?.toUpperCase(),
  });
}

/**
 * A Paddle Billing webhook. The subscription's items identify the price; custom_data (copied
 * from the checkout transaction) identifies the student. Refunds are adjustments: only an
 * approved refund or a chargeback counts; anything else is ignored.
 */
export function normalisePaddle(eventType: string, payload: unknown): NormalisedEvent {
  let action = billingAction("paddle", eventType);
  const d = obj(obj(payload).data);
  const firstPrice = str(obj(obj((Array.isArray(d.items) ? d.items : [])[0]).price).id) ??
    str(obj((Array.isArray(d.items) ? d.items : [])[0]).price_id);

  if (action === "refunded") {
    const kind = str(d.action);
    if (!(kind === "refund" || kind === "chargeback") || str(d.status) !== "approved") action = "ignored";
    return clean({
      action,
      payment_id: str(d.transaction_id),
      subscription_id: str(d.subscription_id),
      amount_minor: int(obj(d.totals).total),
      currency: str(obj(d.totals).currency_code) ?? str(d.currency_code),
    });
  }

  const meta = metadata(d.custom_data);
  if (eventType.startsWith("transaction.")) {
    const subscriptionId = str(d.subscription_id);
    const period = obj(d.billing_period);
    const totals = obj(obj(d.details).totals);
    return clean({
      action,
      user_id: meta.user_id,
      // A renewal pays the subscription's current price; a one-time purchase, the metadata's.
      provider_price_id: subscriptionId ? firstPrice : undefined,
      price_id: subscriptionId && firstPrice ? undefined : meta.price_id,
      subscription_id: subscriptionId,
      payment_id: str(d.id),
      customer_id: str(d.customer_id),
      period_start: str(period.starts_at),
      period_end: str(period.ends_at),
      amount_minor: int(totals.grand_total),
      currency: str(totals.currency_code) ?? str(d.currency_code),
    });
  }

  // subscription.*
  const period = obj(d.current_billing_period);
  const status = str(d.status);
  const scheduled = obj(d.scheduled_change);
  return clean({
    action,
    user_id: meta.user_id,
    provider_price_id: firstPrice,
    price_id: firstPrice ? undefined : meta.price_id,
    subscription_id: str(d.id),
    customer_id: str(d.customer_id),
    period_start: str(period.starts_at),
    period_end: str(period.ends_at),
    status: status === "active" ? "active" : status === "past_due" ? "past_due" : undefined,
    cancel_at_period_end: eventType === "subscription.updated" ? str(scheduled.action) === "cancel" : undefined,
  });
}

// ── Provider APIs ───────────────────────────────────────────────────────────────────────────
type Fetch = typeof fetch;

export class ProviderError extends Error {
  constructor(readonly provider: CheckoutProvider, readonly status: number, readonly body: string) {
    super(`${provider} API ${status}`);
    this.name = "ProviderError";
  }
}

function secret(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

async function call(provider: CheckoutProvider, f: Fetch, url: string, init: RequestInit): Promise<Obj> {
  const res = await f(url, init);
  const text = await res.text();
  // The body may echo customer details: log the status only, keep the body on the error.
  if (!res.ok) throw new ProviderError(provider, res.status, text.slice(0, 2000));
  return obj(text ? JSON.parse(text) : {});
}

export interface Razorpay {
  keyId: string;
  createSubscription(planId: string, notes: Record<string, string>): Promise<{ id: string }>;
  createOrder(amountMinor: number, currency: string, receipt: string, notes: Record<string, string>): Promise<{ id: string }>;
  changePlan(subscriptionId: string, planId: string, when: "now" | "cycle_end"): Promise<void>;
  cancelAtCycleEnd(subscriptionId: string): Promise<void>;
}

export function razorpay(f: Fetch = fetch): Razorpay {
  const keyId = secret("RAZORPAY_KEY_ID");
  const auth = `Basic ${btoa(`${keyId}:${secret("RAZORPAY_KEY_SECRET")}`)}`;
  const base = "https://api.razorpay.com/v1";
  const send = (method: string, path: string, body: unknown) =>
    call("razorpay", f, `${base}${path}`, { method, headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return {
    keyId,
    async createSubscription(planId, notes) {
      // 120 monthly cycles = up to 10 years; the student cancels whenever they like.
      const r = await send("POST", "/subscriptions", { plan_id: planId, total_count: 120, customer_notify: 1, notes });
      return { id: String(r.id) };
    },
    async createOrder(amountMinor, currency, receipt, notes) {
      const r = await send("POST", "/orders", { amount: amountMinor, currency, receipt: receipt.slice(0, 40), notes });
      return { id: String(r.id) };
    },
    async changePlan(subscriptionId, planId, when) {
      await send("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, { plan_id: planId, schedule_change_at: when, customer_notify: 1 });
    },
    async cancelAtCycleEnd(subscriptionId) {
      await send("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });
    },
  };
}

export interface Paddle {
  environment: "sandbox" | "production";
  clientToken: string;
  createTransaction(priceId: string, customData: Record<string, string>): Promise<{ id: string }>;
  changePrice(subscriptionId: string, priceId: string, proration: "prorated_immediately" | "do_not_bill"): Promise<void>;
  cancelAtPeriodEnd(subscriptionId: string): Promise<void>;
  portalUrl(customerId: string, subscriptionIds: string[]): Promise<string>;
}

export function paddle(f: Fetch = fetch): Paddle {
  const environment = Deno.env.get("PADDLE_ENV") === "production" ? "production" : "sandbox";
  const base = environment === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
  const headers = { Authorization: `Bearer ${secret("PADDLE_API_KEY")}`, "Content-Type": "application/json", "Paddle-Version": "1" };
  const send = (method: string, path: string, body: unknown) =>
    call("paddle", f, `${base}${path}`, { method, headers, body: JSON.stringify(body) });
  return {
    environment,
    clientToken: secret("PADDLE_CLIENT_TOKEN"),
    async createTransaction(priceId, customData) {
      const r = await send("POST", "/transactions", { items: [{ price_id: priceId, quantity: 1 }], custom_data: customData });
      return { id: String(obj(r.data).id) };
    },
    async changePrice(subscriptionId, priceId, proration) {
      await send("PATCH", `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: proration,
      });
    },
    async cancelAtPeriodEnd(subscriptionId) {
      await send("POST", `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { effective_from: "next_billing_period" });
    },
    async portalUrl(customerId, subscriptionIds) {
      const r = await send("POST", `/customers/${encodeURIComponent(customerId)}/portal-sessions`, { subscription_ids: subscriptionIds });
      const url = str(obj(obj(obj(r.data).urls).general).overview);
      if (!url) throw new ProviderError("paddle", 502, "portal session without a url");
      return url;
    },
  };
}

/** Plans in order (matches public.plan_rank). */
export const PLAN_RANK: Record<string, number> = { free: 0, gold: 1, platinum: 2 };
