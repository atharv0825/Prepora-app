// Onboarding helpers (M2-F2). Pure, shared by the browser and the server action, unit-tested.
import { EXAM_DATE_MAX_YEARS_AHEAD, addYears } from "@prepora/shared/api/onboarding";

/** A valid IANA time zone ("Asia/Kolkata"), or null. */
export function validTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** Today's date (YYYY-MM-DD) in a time zone; UTC when none is given. */
export function localDate(timeZone: string | null = null, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The exam-date picker's range: today … today + EXAM_DATE_MAX_YEARS_AHEAD. */
export function examDateRange(today: string): { min: string; max: string } {
  return { min: today, max: addYears(today, EXAM_DATE_MAX_YEARS_AHEAD) };
}

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "6.5" for 6.5, "7.0" for 7: bands are always shown with one decimal. */
export function formatBand(band: number): string {
  return band.toFixed(1);
}
