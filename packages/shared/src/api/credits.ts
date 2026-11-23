// Credits & allowances contract (M3-C3). Shared by the web app, the admin panel and (as copies
// checked by tests/contract.test.ts) the Edge Functions and the database.
//
// Tables: plans, credit_costs, credit_buckets, credit_ledger, usage_allowance (M3-C1/C2).
// Functions that return these shapes come next: spend_credits → SpendResult (M3-B1),
// use_allowance → AllowanceResult (M3-B3), get-my-credits → CreditBalance (M3-B5).
//
// Error codes follow the API's snake_case convention (errors.ts): plan.md's
// INSUFFICIENT_CREDITS, DAILY_CAP_REACHED, ALLOWANCE_EXCEEDED and FEATURE_NOT_IN_PLAN are
// insufficient_credits, daily_cap_reached, allowance_exceeded and feature_not_in_plan here.
import { z } from "zod";
import type { Database } from "../db";
import type { ApiErrorCode } from "./errors";
import { plans } from "../types/profile";

type Enums = Database["public"]["Enums"];

// ── Plans ───────────────────────────────────────────────────────────────────────────────────
/** Counts in plans.limits (whole numbers ≥ 0). Must match public.plan_limits_valid(). */
export const planLimitCounts = [
  "monthly_credits",
  "welcome_credits",
  "daily_credit_cap",
  "reading_tests",
  "listening_tests",
  "practice_sessions",
  "mock_tests",
] as const;

/** Feature flags in plans.limits. Must match public.plan_limits_valid(). */
export const planFeatures = ["ocr", "ai_gen", "premium_voice", "detailed_feedback"] as const;
export type PlanFeature = (typeof planFeatures)[number];

/** Flags an AI action can require (credit_costs.required_feature). */
export const gatedFeatures = ["ocr", "ai_gen", "premium_voice"] as const satisfies readonly PlanFeature[];
export type GatedFeature = (typeof gatedFeatures)[number];

const count = z.number().int().min(0);

/** plans.limits, exactly as the database accepts it (all keys, no others). */
export const PlanLimits = z
  .object({
    monthly_credits: count,
    welcome_credits: count,
    daily_credit_cap: count,
    reading_tests: count,
    listening_tests: count,
    practice_sessions: count,
    mock_tests: count,
    ocr: z.boolean(),
    ai_gen: z.boolean(),
    premium_voice: z.boolean(),
    detailed_feedback: z.boolean(),
  })
  .strict();
export type PlanLimits = z.infer<typeof PlanLimits>;

export const PlanTier = z.enum(plans);

// ── Actions ─────────────────────────────────────────────────────────────────────────────────
/**
 * AI actions with a row in credit_costs (seeded in M3-C2). Code refers to these keys, so a new
 * action needs a migration and an entry here; the credits per action stay data (admin-tunable).
 */
export const actionKeys = [
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
export type ActionKey = (typeof actionKeys)[number];
export const ActionKey = z.enum(actionKeys);

/** Monthly allowances for content without AI (usage_allowance counters, plans.limits counts). */
export const allowanceTypes = ["reading_tests", "listening_tests", "practice_sessions", "mock_tests"] as const;
export type AllowanceType = (typeof allowanceTypes)[number];
export const AllowanceType = z.enum(allowanceTypes);

export type CreditSource = Enums["credit_source"];
export const CreditSource = z.enum(["monthly", "welcome", "exam_pack", "topup", "admin"] satisfies CreditSource[]);

// ── Errors ──────────────────────────────────────────────────────────────────────────────────
export const creditErrorCodes = [
  "insufficient_credits",
  "daily_cap_reached",
  "allowance_exceeded",
  "feature_not_in_plan",
] as const satisfies readonly ApiErrorCode[];
export type CreditErrorCode = (typeof creditErrorCodes)[number];
export const CreditErrorCode = z.enum(creditErrorCodes);

export function isCreditErrorCode(value: unknown): value is CreditErrorCode {
  return typeof value === "string" && (creditErrorCodes as readonly string[]).includes(value);
}

/**
 * HTTP status for each code (Edge Functions: errors.* in supabase/functions/_shared/errors.ts).
 * 402: paying (upgrade / top-up) fixes it; 429: wait until tomorrow; 403: not in this plan.
 */
export const creditErrorStatus: Record<CreditErrorCode, number> = {
  insufficient_credits: 402,
  daily_cap_reached: 429,
  allowance_exceeded: 402,
  feature_not_in_plan: 403,
};

/** What the student sees (dialogs in M3-F3). Short, and says what they can do next. */
export const creditErrorMessages: Record<CreditErrorCode, { title: string; body: string }> = {
  insufficient_credits: {
    title: "Not enough credits",
    body: "You've used your AI credits. Top up or upgrade to keep getting feedback.",
  },
  daily_cap_reached: {
    title: "Daily limit reached",
    body: "You've reached today's credit limit. It resets at midnight UTC.",
  },
  allowance_exceeded: {
    title: "Monthly limit reached",
    body: "You've used this month's tests. Upgrade for more, or wait for next month.",
  },
  feature_not_in_plan: {
    title: "Not in your plan",
    body: "This feature is part of a higher plan. Upgrade to unlock it.",
  },
};

// ── Results ─────────────────────────────────────────────────────────────────────────────────
const timestamp = z.iso.datetime({ offset: true });
const uuid = z.uuid();

/**
 * spend_credits(user_id, action_key, ref_id) (M3-B1). Errors are values, not exceptions, so the
 * Edge helper (M3-B6) can map them to HTTP responses; the context fields help the dialog.
 */
export const SpendResult = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      /** Groups the ledger entries of this spend; pass it to refund_credits on failure. */
      reservation_id: uuid,
      action_key: ActionKey,
      credits: count,
      balance_after: count,
      spent_today: count,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      code: z.enum(["insufficient_credits", "daily_cap_reached", "feature_not_in_plan"]),
      action_key: ActionKey,
      /** Credits the action costs. */
      credits: count,
      balance: count.optional(),
      daily_cap: count.optional(),
      spent_today: count.optional(),
      /** The plan flag that's missing (feature_not_in_plan). */
      feature: z.enum(gatedFeatures).optional(),
    })
    .strict(),
]);
export type SpendResult = z.infer<typeof SpendResult>;

/**
 * refund_credits(reservation_id) (M3-B2). Idempotent: a repeat call is "already_refunded";
 * an unknown reservation is "not_found".
 */
export const RefundResult = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      status: z.enum(["refunded", "already_refunded"]),
      reservation_id: uuid,
      refunded: count,
      balance_after: count,
    })
    .strict(),
  z
    .object({ ok: z.literal(false), status: z.literal("not_found"), reservation_id: uuid, refunded: z.literal(0) })
    .strict(),
]);
export type RefundResult = z.infer<typeof RefundResult>;

/** use_allowance(user_id, type) (M3-B3). */
export const AllowanceResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), type: AllowanceType, used: count, limit: count }).strict(),
  z
    .object({ ok: z.literal(false), code: z.literal("allowance_exceeded"), type: AllowanceType, used: count, limit: count })
    .strict(),
]);
export type AllowanceResult = z.infer<typeof AllowanceResult>;

/** One spendable bucket, soonest expiry first. expires_at null = never expires. */
export const CreditBucket = z
  .object({
    id: uuid,
    source: CreditSource,
    granted: count,
    remaining: count,
    expires_at: timestamp.nullable(),
  })
  .strict();
export type CreditBucket = z.infer<typeof CreditBucket>;

export const AllowanceUsage = z.object({ type: AllowanceType, used: count, limit: count }).strict();
export type AllowanceUsage = z.infer<typeof AllowanceUsage>;

/** get-my-credits (M3-B5): everything the header chip and the "Credits & usage" page show. */
export const CreditBalance = z
  .object({
    plan: PlanTier,
    /** Sum of remaining credits in unexpired buckets. */
    balance: count,
    buckets: z.array(CreditBucket),
    spent_today: count,
    daily_cap: count,
    /** Allowance period (YYYY-MM-DD), and what's used of each allowance in it. */
    period_start: z.iso.date(),
    allowances: z.array(AllowanceUsage),
  })
  .strict();
export type CreditBalance = z.infer<typeof CreditBalance>;

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────
/** Credits the student can still spend today: the lower of their balance and what's left of the cap. */
export function spendableToday(balance: Pick<CreditBalance, "balance" | "daily_cap" | "spent_today">): number {
  return Math.max(0, Math.min(balance.balance, balance.daily_cap - balance.spent_today));
}

/** Allowance left (never negative). */
export function allowanceRemaining(usage: Pick<AllowanceUsage, "used" | "limit">): number {
  return Math.max(0, usage.limit - usage.used);
}
