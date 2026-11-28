// POST /functions/v1/billing-webhook (M9-B3). Razorpay and Paddle send their webhooks here.
// No JWT (config.toml: verify_jwt = false): the provider's signature is the authentication.
//
//   1. Which provider: the signature header (X-Razorpay-Signature or Paddle-Signature).
//   2. Verify the signature over the raw body (401, nothing stored, if it fails).
//   3. Store the event (payment_events, unique by provider + event id). A redelivery of an event
//      already applied returns 200 at once.
//   4. Normalise it (_shared/billing.ts) and apply it in one transaction
//      (billing_apply_event: subscriptions, profiles.plan, credits; M9-B3/B4).
//   5. If applying fails, the reason is kept on the event and we answer 500, so the provider
//      retries; the retry applies it (it was never marked processed).

import { errors } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { normalisePaddle, normaliseRazorpay, verifyPaddleSignature, verifyRazorpaySignature } from "../_shared/billing.ts";
import type { Json } from "../_shared/db.ts";

Deno.serve(createHandler({ name: "billing-webhook", auth: "none" }, async ({ req, admin }) => {
  const raw = await req.text();
  const rzpSignature = req.headers.get("x-razorpay-signature");
  const paddleSignature = req.headers.get("paddle-signature");

  let provider: "razorpay" | "paddle";
  if (rzpSignature) {
    if (!(await verifyRazorpaySignature(raw, rzpSignature, Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? ""))) {
      throw errors.unauthorized("Invalid signature");
    }
    provider = "razorpay";
  } else if (paddleSignature) {
    if (!(await verifyPaddleSignature(raw, paddleSignature, Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? ""))) {
      throw errors.unauthorized("Invalid signature");
    }
    provider = "paddle";
  } else {
    throw errors.unauthorized("Missing signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw errors.badRequest("Body must be valid JSON");
  }

  const eventId = provider === "razorpay" ? req.headers.get("x-razorpay-event-id") : String(payload.event_id ?? "");
  const eventType = String((provider === "razorpay" ? payload.event : payload.event_type) ?? "");
  if (!eventId || !eventType) throw errors.badRequest("Missing event id or type");

  const event = provider === "razorpay" ? normaliseRazorpay(eventType, payload) : normalisePaddle(eventType, payload);
  const db = admin();

  const { data: stored, error: recordError } = await db.rpc("billing_record_event", {
    p_provider: provider,
    p_event_id: eventId,
    p_event_type: eventType,
    p_payload: payload as Json,
  });
  if (recordError) throw recordError;
  const row = stored as { id: number; duplicate: boolean; processed: boolean };
  if (row.processed) return { received: true, duplicate: true };

  const { data: applied, error: applyError } = await db.rpc("billing_apply_event", { p_id: row.id, p_event: event as unknown as Json });
  if (applyError) {
    await db.rpc("billing_event_failed", { p_id: row.id, p_error: `${applyError.code ?? ""} ${applyError.message}`.trim() });
    console.error(`[billing-webhook] ${provider} ${eventType} ${eventId}: ${applyError.code} ${applyError.message}`);
    throw errors.internal("Event stored; applying it failed. It will be retried.");
  }
  return { received: true, ...(applied as Record<string, unknown>) };
}));
