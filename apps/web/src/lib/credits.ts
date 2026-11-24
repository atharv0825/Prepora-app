// Credits UI (M3-F1…F3). Pure helpers, unit-tested; components render what they return.
// The numbers come from the database (get_my_credits, credit_costs, credit_ledger); nothing here
// decides what a user may spend. spend_credits in the database is the only judge (M3-B1), the
// client checks are only so the confirm dialog can warn before the request.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@prepora/shared/db";
import {
  type AllowanceType,
  CreditBalance,
  type CreditErrorCode,
  type CreditSource,
  type GatedFeature,
  allowanceRemaining,
  creditErrorMessages,
  isCreditErrorCode,
} from "@prepora/shared/api/credits";
import type { ApiErrorBody } from "@prepora/shared/api/errors";
import { daysBetween, localDate } from "./onboarding";
import { routes } from "./routes";

type Db = SupabaseClient<Database>;
type LedgerReason = Database["public"]["Enums"]["credit_ledger_reason"];

// ── Loading ─────────────────────────────────────────────────────────────────────────────────
/** The signed-in user's credits (M3-B5), checked against the shared contract. Null on any error. */
export async function fetchMyCredits(supabase: Db): Promise<CreditBalance | null> {
  const { data, error } = await supabase.rpc("get_my_credits");
  if (error) return null;
  const parsed = CreditBalance.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Credit cost and label per action, from credit_costs (public, admin-tunable). */
export type CreditCosts = Record<string, { label: string; credits: number }>;

export async function fetchCreditCosts(supabase: Db): Promise<CreditCosts> {
  const { data } = await supabase.from("credit_costs").select("action_key, label, credits").eq("is_active", true);
  return Object.fromEntries((data ?? []).map((c) => [c.action_key, { label: c.label, credits: c.credits }]));
}

// ── Labels ──────────────────────────────────────────────────────────────────────────────────
export const sourceLabels: Record<CreditSource, string> = {
  monthly: "Monthly credits",
  welcome: "Welcome credits",
  exam_pack: "Exam pack",
  topup: "Top-up",
  admin: "From Prepora support",
};

export const allowanceLabels: Record<AllowanceType, { title: string; unit: string }> = {
  reading_tests: { title: "Reading tests", unit: "reading tests" },
  listening_tests: { title: "Listening tests", unit: "listening tests" },
  practice_sessions: { title: "Practice sessions", unit: "practice sessions" },
  mock_tests: { title: "Full mock tests", unit: "mock tests" },
};

export const featureLabels: Record<GatedFeature, string> = {
  ocr: "Photo upload of handwritten answers",
  ai_gen: "AI-generated practice",
  premium_voice: "The natural examiner voice",
};

export function creditsText(n: number): string {
  return `${n} ${n === 1 ? "credit" : "credits"}`;
}

// ── Dates ───────────────────────────────────────────────────────────────────────────────────
/** "Never expires", "Expires today", "Expires tomorrow", "Expires in 5 days", "Expires on 3 Jan 2027". */
export function expiryText(expiresAt: string | null, timeZone: string | null, now: Date = new Date()): string {
  if (!expiresAt) return "Never expires";
  const expires = new Date(expiresAt);
  const days = daysBetween(localDate(timeZone, now), localDate(timeZone, expires));
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 14) return `Expires in ${days} days`;
  return `Expires on ${formatDate(expires, timeZone)}`;
}

export function formatDate(date: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timeZone ?? "UTC", day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatDateTime(date: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone ?? "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

// ── Summary (header chip, dashboard card, page) ─────────────────────────────────────────────
export type AllowanceMeter = { type: AllowanceType; title: string; used: number; limit: number; remaining: number; included: boolean };

export function allowanceMeters(balance: Pick<CreditBalance, "allowances">): AllowanceMeter[] {
  return balance.allowances.map((a) => ({
    type: a.type,
    title: allowanceLabels[a.type].title,
    used: a.used,
    limit: a.limit,
    remaining: allowanceRemaining(a),
    included: a.limit > 0,
  }));
}

/** Percent (0–100) for a meter; 100 when the limit is 0. */
export function meterPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** The bucket that expires next (buckets come soonest-expiry first), if any expires. */
export function nextExpiry(balance: Pick<CreditBalance, "buckets">): { remaining: number; expiresAt: string } | null {
  const b = balance.buckets.find((x) => x.expires_at !== null);
  return b?.expires_at ? { remaining: b.remaining, expiresAt: b.expires_at } : null;
}

// ── History (credit_ledger) ─────────────────────────────────────────────────────────────────
export type LedgerEntry = {
  id: number;
  delta: number;
  reason: LedgerReason;
  action_key: string | null;
  reservation_id: string | null;
  created_at: string;
  bucket: { source: CreditSource } | null;
};

/** HISTORY_LIMIT newest ledger entries (RLS: the user's own), with each entry's bucket source. */
export const HISTORY_LIMIT = 100;

export async function fetchLedger(supabase: Db): Promise<LedgerEntry[] | null> {
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, delta, reason, action_key, reservation_id, created_at, bucket:credit_buckets(source)")
    .order("id", { ascending: false })
    .limit(HISTORY_LIMIT);
  return error ? null : data;
}

export type HistoryRow = { key: string; reason: LedgerReason; label: string; delta: number; createdAt: string };

/**
 * One row per event, newest first. A spend can take credits from several buckets (one ledger
 * entry each), and its refund puts them back the same way: those are merged by reservation.
 */
export function historyRows(entries: readonly LedgerEntry[], costs: CreditCosts): HistoryRow[] {
  const sorted = [...entries].sort((a, b) => b.id - a.id);
  const rows: HistoryRow[] = [];
  const byReservation = new Map<string, HistoryRow>();
  for (const e of sorted) {
    const groupKey = e.reservation_id ? `${e.reason}:${e.reservation_id}` : null;
    const existing = groupKey ? byReservation.get(groupKey) : undefined;
    if (existing) {
      existing.delta += e.delta;
      continue;
    }
    const row: HistoryRow = { key: groupKey ?? `entry:${e.id}`, reason: e.reason, label: historyLabel(e, costs), delta: e.delta, createdAt: e.created_at };
    rows.push(row);
    if (groupKey) byReservation.set(groupKey, row);
  }
  return rows;
}

function historyLabel(e: LedgerEntry, costs: CreditCosts): string {
  const action = e.action_key ? (costs[e.action_key]?.label ?? e.action_key) : "AI feedback";
  const source = e.bucket ? sourceLabels[e.bucket.source] : "Credits";
  switch (e.reason) {
    case "spend":
      return action;
    case "refund":
      return `Refund: ${action}`;
    case "grant":
      return `${source} added`;
    case "expire":
      return `${source} expired`;
    case "admin_adjust":
      return "Adjusted by Prepora support";
  }
}

export function signedCredits(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

// ── Before spending (M3-F2) ─────────────────────────────────────────────────────────────────
export type CreditCheck =
  | { ok: true; balanceAfter: number }
  | { ok: false; code: "insufficient_credits" | "daily_cap_reached"; details: CreditErrorDetails };

/** Same order as spend_credits: balance first, then the daily cap. A hint only; the server decides. */
export function checkCost(balance: CreditBalance, credits: number, actionKey?: string): CreditCheck {
  if (credits > balance.balance) {
    return { ok: false, code: "insufficient_credits", details: { action_key: actionKey, credits, balance: balance.balance } };
  }
  if (balance.spent_today + credits > balance.daily_cap) {
    return {
      ok: false,
      code: "daily_cap_reached",
      details: { action_key: actionKey, credits, daily_cap: balance.daily_cap, spent_today: balance.spent_today },
    };
  }
  return { ok: true, balanceAfter: balance.balance - credits };
}

// ── Credit errors (M3-F3) ───────────────────────────────────────────────────────────────────
/**
 * What the Edge Functions send with a credit refusal (withCredits, M3-B6: the spend_credits or
 * use_allowance result without ok/code). Everything optional: the dialog works without details.
 */
export const CreditErrorDetails = z
  .object({
    action_key: z.string(),
    credits: z.number(),
    balance: z.number(),
    daily_cap: z.number(),
    spent_today: z.number(),
    feature: z.enum(["ocr", "ai_gen", "premium_voice"]),
    type: z.enum(["reading_tests", "listening_tests", "practice_sessions", "mock_tests"]),
    used: z.number(),
    limit: z.number(),
  })
  .partial();
export type CreditErrorDetails = z.infer<typeof CreditErrorDetails>;

export type CreditError = { code: CreditErrorCode; details: CreditErrorDetails };

/** A credit error from an API error body, or null for any other error (handled elsewhere). */
export function toCreditError(error: Pick<ApiErrorBody["error"], "code" | "details"> | null | undefined): CreditError | null {
  if (!error || !isCreditErrorCode(error.code)) return null;
  const details = CreditErrorDetails.safeParse(error.details ?? {});
  return { code: error.code, details: details.success ? details.data : {} };
}

export type CreditErrorAction = { label: string; href: string; primary: boolean };

export type CreditErrorView = { title: string; body: string; detail: string | null; actions: CreditErrorAction[] };

/** Upgrade and top-up go to a placeholder page until billing ships (M9-F3 connects them). */
export function creditErrorView(error: CreditError): CreditErrorView {
  const { title, body } = creditErrorMessages[error.code];
  const d = error.details;
  const upgrade = (primary: boolean): CreditErrorAction => ({ label: "See plans", href: routes.upgrade, primary });
  switch (error.code) {
    case "insufficient_credits":
      return {
        title,
        body,
        detail: d.credits != null && d.balance != null ? `This costs ${creditsText(d.credits)}. You have ${d.balance}.` : null,
        actions: [{ label: "Top up credits", href: routes.topUp, primary: true }, upgrade(false)],
      };
    case "daily_cap_reached":
      return {
        title,
        body,
        detail:
          d.daily_cap != null && d.spent_today != null
            ? `You've used ${d.spent_today} of today's ${creditsText(d.daily_cap)}${d.credits != null ? `, and this costs ${d.credits}` : ""}. Higher plans have a higher daily limit.`
            : "Higher plans have a higher daily limit.",
        actions: [upgrade(false)],
      };
    case "allowance_exceeded":
      return {
        title,
        body,
        detail: d.type && d.limit != null ? `You've used ${d.used ?? d.limit} of ${d.limit} ${allowanceLabels[d.type].unit} this month.` : null,
        actions: [upgrade(true)],
      };
    case "feature_not_in_plan":
      return {
        title,
        body,
        detail: d.feature ? `${featureLabels[d.feature]} isn't included in your plan.` : null,
        actions: [upgrade(true)],
      };
  }
}
