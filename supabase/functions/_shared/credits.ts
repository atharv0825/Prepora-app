// withCredits (M3-B6): every AI Edge Function (M6+) runs its AI call through this.
//
//   return await withCredits(ctx, "writing_t2", async ({ reservationId }) => {
//     const out = await scoreWriting(...);
//     return { result: out.feedback, usage: { model: out.model, input_tokens: …, cost_usd: … } };
//   }, { refId: submissionId });
//
//   1. reserve: spend_credits (service role). A refusal becomes a 402/429/403 error with the
//      code from the shared contract and details for the dialog (M3-F3); fn isn't called.
//   2. run fn.
//   3. log: one ai_usage row (real tokens/cost vs credits charged, plan §5.5).
//   4. on error: refund_credits, log a failed ai_usage row, rethrow fn's error.
// Logging and refund failures are reported but never replace fn's own result or error.
//
// Edge Functions can't import packages/shared, so the action keys and result shapes are copied
// here; tests/contract.test.ts keeps them in sync with packages/shared/src/api/credits.ts.

import type { DbClient } from "./auth.ts";
import { errors, HttpError } from "./errors.ts";

/** AI actions in credit_costs. Must match actionKeys in packages/shared/src/api/credits.ts. */
export const ACTION_KEYS = [
  "speaking_p1",
  "speaking_p2",
  "speaking_p3",
  "writing_t1",
  "writing_t2",
  "ocr",
  "premium_voice",
  "gen_cue_card",
  "gen_writing_prompt",
  "gen_reading_passage",
] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

/** What fn reports about its AI call(s). Unknown numbers can be left out (stored as 0). */
export interface AiUsage {
  model: string;
  input_tokens?: number;
  output_tokens?: number;
  audio_seconds?: number;
  cost_usd?: number;
}

/**
 * Throw this from fn when the AI call failed but you know what it consumed (tokens are often
 * billed even for a failed call): the failure is logged with that usage. Any other error works
 * too; it's logged without usage.
 */
export class AiCallError extends Error {
  constructor(message: string, readonly usage?: AiUsage, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiCallError";
  }
}

export interface CreditsContext {
  user: { id: string } | null;
  admin: () => DbClient;
}

export interface WithCreditsOptions {
  /** What the credits were for (submission / response id): stored in the ledger. */
  refId?: string;
}

export interface WithCreditsResult<T> {
  result: T;
  reservationId: string;
  credits: number;
  balanceAfter: number;
}

type SpendOk = { ok: true; reservation_id: string; credits: number; balance_after: number };
type SpendRefused = {
  ok: false;
  code: "insufficient_credits" | "daily_cap_reached" | "feature_not_in_plan";
  action_key: string;
  credits: number;
  balance?: number;
  daily_cap?: number;
  spent_today?: number;
  feature?: string;
};

const REFUSAL_STATUS: Record<SpendRefused["code"], number> = {
  insufficient_credits: 402,
  daily_cap_reached: 429,
  feature_not_in_plan: 403,
};

const REFUSAL_MESSAGE: Record<SpendRefused["code"], string> = {
  insufficient_credits: "Not enough credits",
  daily_cap_reached: "Daily credit limit reached",
  feature_not_in_plan: "Not included in your plan",
};

function isSpendOk(v: unknown): v is SpendOk {
  const r = v as SpendOk;
  return typeof r === "object" && r !== null && r.ok === true && typeof r.reservation_id === "string" &&
    Number.isInteger(r.credits) && Number.isInteger(r.balance_after);
}

function isSpendRefused(v: unknown): v is SpendRefused {
  const r = v as SpendRefused;
  return typeof r === "object" && r !== null && r.ok === false && r.code in REFUSAL_STATUS;
}

/** The HTTP error for a refused spend; details are what the dialog needs (no internals). */
export function refusalError(r: SpendRefused): HttpError {
  const { ok: _ok, code, ...details } = r;
  return new HttpError(REFUSAL_STATUS[code], code, REFUSAL_MESSAGE[code], details);
}

function nonNegative(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

async function logUsage(
  admin: DbClient,
  row: {
    userId: string;
    actionKey: ActionKey;
    reservationId: string;
    usage: AiUsage | undefined;
    credits: number;
    success: boolean;
    latencyMs: number;
  },
): Promise<void> {
  try {
    const { error } = await admin.from("ai_usage").insert({
      user_id: row.userId,
      action_key: row.actionKey,
      model: row.usage?.model?.slice(0, 80) || "unknown",
      input_tokens: Math.round(nonNegative(row.usage?.input_tokens)),
      output_tokens: Math.round(nonNegative(row.usage?.output_tokens)),
      audio_seconds: nonNegative(row.usage?.audio_seconds),
      cost_usd: nonNegative(row.usage?.cost_usd),
      credits_charged: row.credits,
      success: row.success,
      latency_ms: Math.round(row.latencyMs),
      reservation_id: row.reservationId,
    });
    if (error) console.error("[withCredits] ai_usage insert failed", error.code, error.message);
  } catch (err) {
    console.error("[withCredits] ai_usage insert failed", err);
  }
}

export async function withCredits<T>(
  ctx: CreditsContext,
  actionKey: ActionKey,
  fn: (reservation: { reservationId: string; credits: number }) => Promise<{ result: T; usage: AiUsage }>,
  opts: WithCreditsOptions = {},
): Promise<WithCreditsResult<T>> {
  if (!ctx.user) throw errors.unauthorized();
  const userId = ctx.user.id;
  const admin = ctx.admin();

  // 1. Reserve.
  const { data, error } = await admin.rpc("spend_credits", {
    p_user_id: userId,
    p_action_key: actionKey,
    p_ref_id: opts.refId,
  });
  if (error) throw new Error(`spend_credits failed: ${error.code} ${error.message}`);
  if (isSpendRefused(data)) throw refusalError(data);
  if (!isSpendOk(data)) throw new Error("spend_credits returned an unexpected result");

  const { reservation_id: reservationId, credits, balance_after: balanceAfter } = data;
  const started = performance.now();

  // 2. Run.
  let out: { result: T; usage: AiUsage };
  try {
    out = await fn({ reservationId, credits });
  } catch (err) {
    // 4. Refund and log the failure; then rethrow the original error.
    const latencyMs = performance.now() - started;
    try {
      const refund = await admin.rpc("refund_credits", { p_reservation_id: reservationId });
      if (refund.error) {
        console.error("[withCredits] refund failed", reservationId, refund.error.code, refund.error.message);
      }
    } catch (refundErr) {
      console.error("[withCredits] refund failed", reservationId, refundErr);
    }
    await logUsage(admin, {
      userId,
      actionKey,
      reservationId,
      usage: err instanceof AiCallError ? err.usage : undefined,
      credits: 0,
      success: false,
      latencyMs,
    });
    throw err;
  }

  // 3. Log success.
  await logUsage(admin, {
    userId,
    actionKey,
    reservationId,
    usage: out.usage,
    credits,
    success: true,
    latencyMs: performance.now() - started,
  });
  return { result: out.result, reservationId, credits, balanceAfter };
}
