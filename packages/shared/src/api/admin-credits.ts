// Admin plans & credits contract (M3-A1/A2). Backed by admin-only RPCs (SECURITY DEFINER, 42501
// for non-admins; supabase/migrations/20261124101500_admin_credits.sql): admin_update_plan,
// admin_update_credit_cost, admin_user_credits, admin_user_ledger, admin_grant_credits,
// admin_refund_credits, admin_audit_entries. Every change is written to audit_log.
//
// The input schemas mirror the database checks so the admin panel can say what's wrong before
// the request; the database checks again and has the final say.
import { z } from "zod";
import type { Database } from "../db";
import { PlanLimits, PlanTier, planFeatures, planLimitCounts } from "./credits";

type Functions = Database["public"]["Functions"];
type WithNulls<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

// ── M3-A1: plans ────────────────────────────────────────────────────────────────────────────
/** Highest count the editor accepts for a plan limit (sanity bound; the database needs ≥ 0). */
export const PLAN_COUNT_MAX = 100_000;

/** A plan's limits from the editor form (FormData: numbers as text, checked boxes as "on"). */
export function planLimitsFromForm(form: FormData): z.ZodSafeParseResult<PlanLimits> {
  const raw: Record<string, unknown> = {};
  for (const key of planLimitCounts) {
    const value = form.get(key);
    raw[key] = typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value;
  }
  for (const key of planFeatures) raw[key] = form.get(key) === "on";
  return PlanLimits.superRefine((limits, ctx) => {
    for (const key of planLimitCounts) {
      if (limits[key] > PLAN_COUNT_MAX) ctx.addIssue({ code: "custom", path: [key], message: `At most ${PLAN_COUNT_MAX}` });
    }
  }).safeParse(raw);
}

export const AdminPlanUpdate = z.object({ id: PlanTier, limits: PlanLimits });
export type AdminPlanUpdate = z.infer<typeof AdminPlanUpdate>;

// ── M3-A1: credit costs ─────────────────────────────────────────────────────────────────────
export const CREDIT_COST_MAX = 1000;

export const AdminCreditCostUpdate = z.object({
  action_key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
  credits: z.coerce.number().int().min(0).max(CREDIT_COST_MAX),
});
export type AdminCreditCostUpdate = z.infer<typeof AdminCreditCostUpdate>;

// ── M3-A2: grant and refund ─────────────────────────────────────────────────────────────────
export const GRANT_MAX = 1000;
export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

/** Expiry choices for a support grant: days, or never. */
export const grantExpiryOptions = [
  { value: "30", label: "In 30 days" },
  { value: "90", label: "In 90 days" },
  { value: "365", label: "In 1 year" },
  { value: "never", label: "Never" },
] as const;

const note = z
  .string()
  .trim()
  .min(NOTE_MIN, `Write a note of at least ${NOTE_MIN} characters (why, ticket number)`)
  .max(NOTE_MAX, `At most ${NOTE_MAX} characters`);

export const AdminGrantInput = z.object({
  user_id: z.uuid(),
  amount: z.coerce
    .number({ message: "Enter a number of credits" })
    .int("Whole credits only")
    .min(1, "At least 1 credit")
    .max(GRANT_MAX, `At most ${GRANT_MAX} credits at a time`),
  /** Days until the credits expire, or null for never. */
  expires_in_days: z
    .union([z.literal("never"), z.coerce.number().int().min(1).max(730)])
    .transform((v) => (v === "never" ? null : v)),
  note,
});
export type AdminGrantInput = z.infer<typeof AdminGrantInput>;

export function adminGrantArgs(input: AdminGrantInput): Functions["admin_grant_credits"]["Args"] {
  return {
    p_user_id: input.user_id,
    p_amount: input.amount,
    // The generated type marks it required; null (never expires) is what the function expects.
    p_expires_in_days: input.expires_in_days as number,
    p_note: input.note,
  };
}

export const AdminGrantResult = z
  .object({
    ok: z.literal(true),
    bucket_id: z.uuid(),
    amount: z.number().int(),
    expires_at: z.iso.datetime({ offset: true }).nullable(),
    balance_after: z.number().int(),
  })
  .strict();
export type AdminGrantResult = z.infer<typeof AdminGrantResult>;

export const AdminRefundInput = z.object({ user_id: z.uuid(), reservation_id: z.uuid(), note });
export type AdminRefundInput = z.infer<typeof AdminRefundInput>;

// ── Rows ────────────────────────────────────────────────────────────────────────────────────
/** One credit_ledger entry for the admin (refunded: a spend that has a refund). */
export type AdminLedgerEntry = WithNulls<
  Functions["admin_user_ledger"]["Returns"][number],
  "action_key" | "reservation_id" | "bucket_source"
>;

/** One audit_log row with the admin's name and email (null if their account is gone). */
export type AdminAuditEntry = WithNulls<
  Functions["admin_audit_entries"]["Returns"][number],
  "entity_id" | "admin_name" | "admin_email"
>;

/** Audit actions written so far (audit_log.action). */
export const auditActions = ["plan.update", "credit_cost.update", "credits.grant", "credits.refund"] as const;
export type AuditAction = (typeof auditActions)[number];
