// Home dashboard overview contract: what get_my_dashboard() returns
// (supabase/migrations/…_dashboard_stats.sql), and the pure helpers the chart cards use.
import { z } from "zod";
import { ieltsRound } from "../ielts/bands";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const band = z.number().min(0).max(9);

export const DASHBOARD_MODULES = ["reading", "listening", "writing", "speaking"] as const;
export type DashboardModuleKey = (typeof DASHBOARD_MODULES)[number];

export const ModuleStats = z.object({
  module: z.enum(DASHBOARD_MODULES),
  /** Scored pieces of practice: tests (Reading, Listening), answers (Writing), parts (Speaking). */
  count: z.number().int().min(0),
  latest_band: band.nullable(),
  /** Average of the last 5 bands (2 decimals). */
  recent_band: band.nullable(),
});
export type ModuleStats = z.infer<typeof ModuleStats>;

export const DayStats = z.object({
  date: isoDate,
  count: z.number().int().min(0),
  average_band: band.nullable(),
});
export type DayStats = z.infer<typeof DayStats>;

export const DashboardStats = z.object({
  timezone: z.string().min(1),
  today: isoDate,
  /** Always the four modules, in exam order. */
  modules: z.array(ModuleStats).length(4),
  /** The last 14 days in the student's time zone, oldest first, today last. */
  days: z.array(DayStats).length(14),
});
export type DashboardStats = z.infer<typeof DashboardStats>;

/**
 * An overall estimate: the IELTS-rounded mean of each practised module's recent band. Null until
 * at least one module has a band. `from` says how many modules it is based on.
 */
export function estimatedBand(modules: readonly ModuleStats[]): { band: number; from: number } | null {
  const bands = modules.map((m) => m.recent_band).filter((b): b is number => b !== null);
  if (!bands.length) return null;
  return { band: ieltsRound(bands.reduce((a, b) => a + b, 0) / bands.length), from: bands.length };
}

export function totalPractice(modules: readonly ModuleStats[]): number {
  return modules.reduce((sum, m) => sum + m.count, 0);
}

/** Each module's share of all practice, in whole percent (largest-remainder, so they add up to 100). */
export function practiceShares(modules: readonly ModuleStats[]): Record<DashboardModuleKey, number> {
  const total = totalPractice(modules);
  const shares = Object.fromEntries(DASHBOARD_MODULES.map((k) => [k, 0])) as Record<DashboardModuleKey, number>;
  if (!total) return shares;
  const exact = modules.map((m) => ({ key: m.module, value: (m.count / total) * 100 }));
  let left = 100;
  for (const e of exact) {
    shares[e.key] = Math.floor(e.value);
    left -= shares[e.key];
  }
  [...exact].sort((a, b) => (b.value % 1) - (a.value % 1)).slice(0, left).forEach((e) => (shares[e.key] += 1));
  return shares;
}

export type WeekSummary = {
  /** The last 7 days, oldest first (today last). */
  thisWeek: DayStats[];
  /** The 7 days before those, oldest first, lined up day for day with thisWeek. */
  lastWeek: DayStats[];
  thisWeekCount: number;
  lastWeekCount: number;
  /** Whole-percent change in practice count; null when last week had none. */
  change: number | null;
  /** Average band over this week's practice (weighted by count), 2 decimals; null without any. */
  thisWeekBand: number | null;
  lastWeekBand: number | null;
};

function weightedBand(days: readonly DayStats[]): number | null {
  const scored = days.filter((d) => d.average_band !== null && d.count > 0);
  const n = scored.reduce((s, d) => s + d.count, 0);
  if (!n) return null;
  return Math.round((scored.reduce((s, d) => s + d.average_band! * d.count, 0) / n) * 100) / 100;
}

/** This week vs the week before, for the trend card. */
export function weekSummary(days: readonly DayStats[]): WeekSummary {
  const lastWeek = days.slice(-14, -7);
  const thisWeek = days.slice(-7);
  const thisWeekCount = thisWeek.reduce((s, d) => s + d.count, 0);
  const lastWeekCount = lastWeek.reduce((s, d) => s + d.count, 0);
  return {
    thisWeek,
    lastWeek,
    thisWeekCount,
    lastWeekCount,
    change: lastWeekCount ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : null,
    thisWeekBand: weightedBand(thisWeek),
    lastWeekBand: weightedBand(lastWeek),
  };
}
