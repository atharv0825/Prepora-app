"use client";

import { useCallback } from "react";
import type { ListeningGradeResponse, ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { useCredits } from "@/components/credits/credits-provider";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";
import { type GradeListening, ListeningTest } from "./listening-test";

/**
 * A published Listening test (M5-B2 grading): the same player as the sample, marked by grade-test
 * with module "listening", which uses one Listening allowance, saves the attempt with its mode and
 * returns the results with the transcripts. Running out of tests opens the allowance dialog
 * (useCredits().run); the answers stay on this device.
 */
export function LiveListeningTest({ payload }: { payload: ListeningTestPayload }) {
  const { run } = useCredits();
  const grade = useCallback<GradeListening>(
    async (input) => {
      const result = await run(() =>
        invokeFunction<ListeningGradeResponse>(createClient(), "grade-test", {
          body: { module: "listening", test_id: payload.test.id, ...input },
        }),
      );
      if (result.data) {
        const { mode, raw_score, total, band, results, transcripts } = result.data;
        return { data: { mode, raw_score, total, band, results, transcripts }, error: null };
      }
      return {
        data: null,
        error:
          result.error.code === "allowance_exceeded"
            ? "This month's Listening tests are used up. Your answers are saved on this device."
            : `Your answers couldn't be sent: ${result.error.message} They're saved on this device; try again.`,
      };
    },
    [payload.test.id, run],
  );
  return <ListeningTest payload={payload} grade={grade} />;
}
