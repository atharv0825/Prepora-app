// Home dashboard (M2-F3). Pure helpers, unit-tested; the page renders what they return.
import type { TestType } from "@prepora/shared/types/profile";
import { daysBetween } from "./onboarding";

// ── Modules ─────────────────────────────────────────────────────────────────────────────────
export type ModuleKey = "reading" | "listening" | "writing" | "speaking";

export type DashboardModule = {
  key: ModuleKey;
  title: string;
  description: string;
  /** "soon" until the module's milestone ships; then "available" with its route. */
  status: "available" | "soon";
  href?: string;
};

/**
 * The four IELTS modules, in exam order. Flip `status` to "available" (and set `href`) when a
 * module is built: Reading M4, Listening M5, Writing M6, Speaking M7 (plan.md).
 */
export const dashboardModules: readonly DashboardModule[] = [
  { key: "reading", title: "Reading", description: "Timed passages with instant band scores.", status: "soon" },
  { key: "listening", title: "Listening", description: "Real-exam audio, all four sections.", status: "soon" },
  { key: "writing", title: "Writing", description: "Task 1 and 2 scored by AI, with corrections.", status: "soon" },
  { key: "speaking", title: "Speaking", description: "Talk to an AI examiner, get a band per criterion.", status: "soon" },
];

/**
 * The tile highlighted in green (UI design: "the next recommended module"). For now the first
 * available module; null while none is built. Later milestones can base it on practice history.
 */
export function recommendedModule(modules: readonly DashboardModule[]): ModuleKey | null {
  return modules.find((m) => m.status === "available")?.key ?? null;
}

// ── Greeting ────────────────────────────────────────────────────────────────────────────────
/** The hour (0–23) now in a time zone; null when the zone is missing or invalid. */
export function hourIn(timeZone: string | null | undefined, now: Date = new Date()): number | null {
  if (!timeZone) return null;
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now);
    return Number(hour);
  } catch {
    return null;
  }
}

/** "Good morning" 5–11, "Good afternoon" 12–16, "Good evening" otherwise; "Welcome back" without a time zone. */
export function greeting(hour: number | null): string {
  if (hour === null) return "Welcome back";
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** First word of the display name ("Asha Rao" → "Asha"); emails are cut at the @. */
export function firstName(name: string): string {
  return name.split("@")[0]!.trim().split(/\s+/)[0] || name;
}

// ── Exam countdown ──────────────────────────────────────────────────────────────────────────
export type ExamCountdown =
  | { kind: "none" }
  | { kind: "upcoming"; days: number }
  | { kind: "today" }
  | { kind: "past" };

/** Days from the student's today to their exam date (both YYYY-MM-DD). */
export function examCountdown(examDate: string | null | undefined, today: string): ExamCountdown {
  if (!examDate) return { kind: "none" };
  const days = daysBetween(today, examDate);
  if (days > 0) return { kind: "upcoming", days };
  if (days === 0) return { kind: "today" };
  return { kind: "past" };
}

export function testTypeLabel(testType: TestType | null | undefined): string | null {
  if (testType === "academic") return "Academic";
  if (testType === "general") return "General Training";
  return null;
}

/** "Free", "Gold", "Platinum" from the plan_tier value. */
export function planLabel(plan: string | null | undefined): string {
  const p = plan || "free";
  return p.charAt(0).toUpperCase() + p.slice(1);
}
