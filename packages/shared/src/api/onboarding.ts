// Onboarding contract (M2-C2). The 3-step flow (M2-F2): Academic or General → target band →
// exam date (skippable). Saved to the user's own profile row (M2-C1 columns), so these rules sit
// inside the database's (1.0–9.0 band, 2020–2100 date) and add what makes sense for a NEW goal.
import { z } from "zod";
import { testTypes } from "../types/profile";

/** Bands offered in onboarding: 4.0–9.0 in half steps (DB accepts 1.0–9.0). */
export const ONBOARDING_BAND_MIN = 4;
export const ONBOARDING_BAND_MAX = 9;
export const onboardingBands: readonly number[] = Array.from(
  { length: (ONBOARDING_BAND_MAX - ONBOARDING_BAND_MIN) * 2 + 1 },
  (_, i) => ONBOARDING_BAND_MIN + i / 2,
);

/** An exam date can be at most this far ahead (IELTS dates are bookable about a year out). */
export const EXAM_DATE_MAX_YEARS_AHEAD = 2;

export const onboardingSteps = ["test_type", "target_band", "exam_date"] as const;
export type OnboardingStep = (typeof onboardingSteps)[number];

function addYears(isoDate: string, years: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  // Feb 29 + 2 years → Feb 28 (clamp), not Mar 1.
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * Builds the onboarding schema for a given "today" (YYYY-MM-DD in the student's time zone), so
 * the exam date can't be in the past and tests are deterministic. The server action passes its
 * own today; the browser passes the local date.
 */
export function onboardingInput(today: string) {
  const latest = addYears(today, EXAM_DATE_MAX_YEARS_AHEAD);
  return z
    .object({
      test_type: z.enum(testTypes, "Choose Academic or General Training."),
      target_band: z
        .number("Choose a target band.")
        .min(ONBOARDING_BAND_MIN, "Choose a band from 4.0 to 9.0.")
        .max(ONBOARDING_BAND_MAX, "Choose a band from 4.0 to 9.0.")
        .multipleOf(0.5, "Bands go in half steps (for example 6.5)."),
      // null = "I haven't booked yet" (the step is skippable).
      exam_date: z
        .iso.date("Choose a valid date.")
        .refine((d) => d >= today, "Your exam date can't be in the past.")
        .refine((d) => d <= latest, `Choose a date within ${EXAM_DATE_MAX_YEARS_AHEAD} years.`)
        .nullable(),
    })
    .strict();
}

export type OnboardingInput = z.infer<ReturnType<typeof onboardingInput>>;

/** Whether a profile still needs onboarding: test type and target band are required. */
export function needsOnboarding(profile: { test_type: unknown; target_band: unknown } | null | undefined): boolean {
  return !profile || profile.test_type == null || profile.target_band == null;
}
