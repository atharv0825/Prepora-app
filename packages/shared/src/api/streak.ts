// Practice streak contract: what get_my_streak() returns (supabase/migrations/…_streaks.sql).
//
// A practice day is a day, in the student's time zone, with at least one scored Reading or
// Listening test, Writing answer or Speaking part. The current streak runs to today, or to
// yesterday while today is still open; `recent` lists the practice days among the last
// `p_days` (7 for the dashboard card, 84 for the profile calendar; at most 120).
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The longest history get_my_streak(p_days) returns. */
export const STREAK_MAX_DAYS = 120;
/** Days on the profile calendar: 12 weeks. */
export const STREAK_CALENDAR_DAYS = 84;

export const Streak = z.object({
  timezone: z.string().min(1),
  /** Today in the student's time zone (YYYY-MM-DD). */
  today: isoDate,
  current: z.number().int().min(0),
  longest: z.number().int().min(0),
  /** Every practice day ever. */
  total_days: z.number().int().min(0),
  practised_today: z.boolean(),
  /** Practice days among the last `p_days` (today included), oldest first. */
  recent: z.array(isoDate).max(STREAK_MAX_DAYS),
});
export type Streak = z.infer<typeof Streak>;

/** YYYY-MM-DD `days` before `date` (calendar arithmetic, no time zone involved). */
export function daysBefore(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type StreakDay = { date: string; practised: boolean; today: boolean };

/** The `count` days ending today, oldest first (the dashboard strip, the profile calendar). */
export function lastDays(streak: Pick<Streak, "today" | "recent">, count: number): StreakDay[] {
  const done = new Set(streak.recent);
  return Array.from({ length: count }, (_, i) => {
    const date = daysBefore(streak.today, count - 1 - i);
    return { date, practised: done.has(date), today: i === count - 1 };
  });
}

/** The 7 days ending today, oldest first, for the week strip. */
export function lastSevenDays(streak: Pick<Streak, "today" | "recent">): StreakDay[] {
  return lastDays(streak, 7);
}

/** Monday = 0 … Sunday = 6, for lining the calendar up in weeks. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** One line under the number: what the student should do next. */
export function streakMessage(streak: Pick<Streak, "current" | "longest" | "practised_today">): string {
  const { current, longest, practised_today } = streak;
  if (current === 0) {
    return longest > 0
      ? "Practise today to start a new streak."
      : "Finish any practice today to start your streak.";
  }
  if (!practised_today) return `Practise today to keep your ${current}-day streak going.`;
  if (current >= longest && current > 1) return "Your best streak yet. Come back tomorrow!";
  return "Done for today. Come back tomorrow to keep it going.";
}
