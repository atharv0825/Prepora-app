// Display helpers for plans & credits (M3-A1/A2). Pure, unit-tested.
import type { AdminAuditEntry, AdminLedgerEntry } from "@prepora/shared/api/admin-credits";
import type { CreditSource, GatedFeature, PlanFeature, planLimitCounts } from "@prepora/shared/api/credits";
import type { Database } from "@prepora/shared/db";

type LedgerReason = Database["public"]["Enums"]["credit_ledger_reason"];
type PlanCount = (typeof planLimitCounts)[number];

// ── Plan editor ─────────────────────────────────────────────────────────────────────────────
export const planCountFields: { title: string; note: string; fields: { key: PlanCount; label: string; hint: string }[] }[] = [
  {
    title: "AI credits",
    note: "New credit amounts apply to the next grant. The daily cap applies at once.",
    fields: [
      { key: "monthly_credits", label: "Monthly credits", hint: "Granted each month" },
      { key: "welcome_credits", label: "Welcome credits", hint: "Once, at sign-up (Free)" },
      { key: "daily_credit_cap", label: "Daily cap", hint: "Most credits a user can spend per UTC day" },
    ],
  },
  {
    title: "Monthly allowances",
    note: "Tests and sessions without AI. 0 = not in this plan. Applies at once.",
    fields: [
      { key: "reading_tests", label: "Reading tests", hint: "Per month" },
      { key: "listening_tests", label: "Listening tests", hint: "Per month" },
      { key: "practice_sessions", label: "Practice sessions", hint: "Per month" },
      { key: "mock_tests", label: "Full mock tests", hint: "Per month" },
    ],
  },
];

export const planFeatureLabels: Record<PlanFeature, string> = {
  ocr: "Photo upload of handwritten answers (OCR)",
  ai_gen: "AI-generated practice",
  premium_voice: "Natural examiner voice",
  detailed_feedback: "Detailed AI feedback",
};

export const gatedFeatureLabels: Record<GatedFeature, string> = {
  ocr: "OCR",
  ai_gen: "AI generation",
  premium_voice: "Natural voice",
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** 1 credit ≈ US$0.01 of AI budget (Implementation Plan §2.5). */
export const CREDIT_BUDGET_USD = 0.01;

/** "$0.04 budget · $0.032 estimated", so the admin sees the margin while repricing. */
export function costNote(credits: number, estCostUsd: number | null): string {
  const budget = `${usd.format(credits * CREDIT_BUDGET_USD)} budget`;
  return estCostUsd == null ? `${budget} · cost not estimated yet` : `${budget} · ${usd.format(estCostUsd)} estimated`;
}

/** True when the credits charged don't cover the estimated AI cost. */
export function underBudget(credits: number, estCostUsd: number | null): boolean {
  return estCostUsd != null && credits * CREDIT_BUDGET_USD < estCostUsd;
}

// ── Ledger ──────────────────────────────────────────────────────────────────────────────────
export const sourceLabels: Record<CreditSource, string> = {
  monthly: "Monthly",
  welcome: "Welcome",
  exam_pack: "Exam pack",
  topup: "Top-up",
  admin: "Admin grant",
};

export type LedgerRow = {
  key: string;
  reason: LedgerReason;
  label: string;
  /** Buckets the entries touched, e.g. "Monthly + Welcome". */
  buckets: string;
  delta: number;
  createdAt: string;
  /** Spends only: the reservation to refund, and whether that already happened. */
  reservationId: string | null;
  refunded: boolean;
};

/**
 * One row per event, newest first: a spend across several buckets (one entry each) and its
 * refund are merged by reservation, like the student's history (web lib/credits.ts).
 */
export function ledgerRows(entries: readonly AdminLedgerEntry[], costLabels: Record<string, string>): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const groups = new Map<string, { row: LedgerRow; sources: Set<string> }>();
  for (const e of [...entries].sort((a, b) => b.id - a.id)) {
    const groupKey = e.reservation_id ? `${e.reason}:${e.reservation_id}` : null;
    const source = e.bucket_source ? sourceLabels[e.bucket_source] : null;
    const existing = groupKey ? groups.get(groupKey) : undefined;
    if (existing) {
      existing.row.delta += e.delta;
      existing.row.refunded ||= e.refunded;
      if (source) existing.sources.add(source);
      existing.row.buckets = [...existing.sources].join(" + ");
      continue;
    }
    const row: LedgerRow = {
      key: groupKey ?? `entry:${e.id}`,
      reason: e.reason,
      label: ledgerLabel(e, costLabels),
      buckets: source ?? "—",
      delta: e.delta,
      createdAt: e.created_at,
      reservationId: e.reason === "spend" ? e.reservation_id : null,
      refunded: e.refunded,
    };
    rows.push(row);
    if (groupKey) groups.set(groupKey, { row, sources: new Set(source ? [source] : []) });
  }
  return rows;
}

function ledgerLabel(e: AdminLedgerEntry, costLabels: Record<string, string>): string {
  const action = e.action_key ? (costLabels[e.action_key] ?? e.action_key) : "AI action";
  switch (e.reason) {
    case "spend":
      return action;
    case "refund":
      return `Refund: ${action}`;
    case "grant":
      return "Credits granted";
    case "expire":
      return "Credits expired";
    case "admin_adjust":
      return "Adjusted by an admin";
  }
}

export function signedCredits(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`;
}

// ── Audit log ───────────────────────────────────────────────────────────────────────────────
type Change = { from: unknown; to: unknown };

const fieldLabels: Record<string, string> = {
  monthly_credits: "monthly credits",
  welcome_credits: "welcome credits",
  daily_credit_cap: "daily cap",
  reading_tests: "reading tests",
  listening_tests: "listening tests",
  practice_sessions: "practice sessions",
  mock_tests: "mock tests",
  ocr: "OCR",
  ai_gen: "AI generation",
  premium_voice: "natural voice",
  detailed_feedback: "detailed feedback",
  credits: "credits",
};

function show(value: unknown): string {
  if (value === true) return "on";
  if (value === false) return "off";
  return value == null ? "—" : String(value);
}

function changesText(details: unknown): string {
  const changes = (details as { changes?: Record<string, Change> } | null)?.changes ?? {};
  const parts = Object.entries(changes).map(([k, c]) => `${fieldLabels[k] ?? k} ${show(c.from)} → ${show(c.to)}`);
  return parts.length ? parts.join(", ") : "no changes";
}

/** What an audit row says, in a sentence: "Free plan: monthly credits 8 → 10". */
export function auditText(entry: Pick<AdminAuditEntry, "action" | "entity_id" | "details">, costLabels: Record<string, string> = {}): string {
  const d = (entry.details ?? {}) as Record<string, unknown>;
  switch (entry.action) {
    case "plan.update":
      return `${titleCase(entry.entity_id)} plan: ${changesText(d)}`;
    case "credit_cost.update":
      return `${(entry.entity_id && costLabels[entry.entity_id]) || entry.entity_id}: ${changesText(d)}`;
    case "credits.grant": {
      const expiry = typeof d.expires_at === "string" ? `, expires ${formatShortDate(d.expires_at)}` : ", never expires";
      return `Granted ${show(d.amount)} credits${expiry}`;
    }
    case "credits.refund": {
      const action = typeof d.action_key === "string" ? (costLabels[d.action_key] ?? d.action_key) : "a spend";
      return `Refunded ${show(d.refunded)} credits: ${action}`;
    }
    default:
      return entry.action;
  }
}

/** The admin's note on a grant or refund, if any. */
export function auditNote(entry: Pick<AdminAuditEntry, "details">): string | null {
  const note = (entry.details as { note?: unknown } | null)?.note;
  return typeof note === "string" && note ? note : null;
}

export function auditBy(entry: Pick<AdminAuditEntry, "admin_name" | "admin_email">): string {
  return entry.admin_name?.trim() || entry.admin_email || "A deleted admin";
}

function titleCase(value: string | null): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function formatShortDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : shortDate.format(d);
}
