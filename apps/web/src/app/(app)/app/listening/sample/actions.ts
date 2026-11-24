"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ListeningMode } from "@prepora/shared/api/listening-test";
import { ReadingResponse } from "@prepora/shared/ielts/reading";
import { appEnvironment } from "@prepora/shared/observability";
import type { ListeningResultsData } from "@/lib/listening/answers";
import { gradeSample } from "@/lib/listening/sample-grade";
import { getCurrentUser } from "@/lib/supabase/session";

const Input = z
  .object({
    mode: ListeningMode,
    answers: z.record(z.string().regex(/^([1-9]|[1-3]\d|40)$/), ReadingResponse),
    time_taken_sec: z.number().int().min(0).max(86_400),
  })
  .strict();

/**
 * Marks the sample Listening test on the server, so its answer keys and transcripts never reach
 * the browser before submission, as with grade-test. Nothing is saved and no allowance is used:
 * it's a stand-in until grade-test handles Listening (M5-B2). Refused in production.
 */
export async function gradeSampleListening(
  input: unknown,
): Promise<{ data: ListeningResultsData; error: null } | { data: null; error: string }> {
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
  if (appEnvironment(host) === "production") return { data: null, error: "Not available." };
  if (!(await getCurrentUser())) return { data: null, error: "Your session has ended. Sign in again." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { data: null, error: "Those answers couldn't be read. Reload the page and try again." };
  return { data: gradeSample(parsed.data.mode, parsed.data.answers), error: null };
}
