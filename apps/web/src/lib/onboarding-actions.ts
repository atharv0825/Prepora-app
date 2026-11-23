"use server";

import { revalidatePath } from "next/cache";
import { onboardingInput, type OnboardingStep } from "@prepora/shared/api/onboarding";
import { localDate, validTimeZone } from "@/lib/onboarding";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

// Onboarding Server Function (M2-F2). Public endpoint like every Server Function: it checks the
// session itself, validates again with the shared contract (M2-C2), and writes through the
// user's own session (RLS + the M2-C1 column grant).

export type OnboardingResult =
  | { status: "saved" }
  | { status: "error"; message: string; step?: OnboardingStep };

/**
 * Saves the three answers (and the browser's time zone) on the caller's profile.
 * `timeZone` decides "today" for the exam-date check, so a date that's today for the student
 * isn't rejected because the server runs in UTC. An invalid zone falls back to UTC.
 */
export async function completeOnboarding(input: unknown, timeZone: unknown): Promise<OnboardingResult> {
  const tz = validTimeZone(timeZone);
  const parsed = onboardingInput(localDate(tz)).safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const step = issue?.path[0];
    return {
      status: "error",
      message: issue?.message ?? "Check your answers.",
      step: step === "test_type" || step === "target_band" || step === "exam_date" ? step : undefined,
    };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Your session has ended. Log in again." };

  const { data, error } = await supabase
    .from("profiles")
    .update({ ...parsed.data, ...(tz ? { timezone: tz } : {}) })
    .eq("id", auth.user.id)
    .select("id");

  if (error) {
    console.error("completeOnboarding failed", error.code, error.message);
    return { status: "error", message: "Couldn't save your answers. Please try again." };
  }
  if (!data?.length) {
    // No profile row yet: created by the sign-up trigger (M1-B2).
    return { status: "error", message: "Your profile isn't set up yet. Please try again shortly." };
  }

  revalidatePath(routes.app, "layout");
  return { status: "saved" };
}
