// get_reading_test(id) contract (M4-B1): what the Reading player loads. Never contains answers
// or explanations: the RPC runs with the student's rights, and those columns are closed to them
// (M4-C1). Call: supabase.rpc("get_reading_test", { p_test_id }).
// Errors: HTTP 404 (not found / not published), 403 (plan too low; the message names the plan).
import { z } from "zod";
import { PlanTier } from "./credits";
import { PublicReadingQuestion } from "../ielts/reading";

export const ReadingTestPayload = z
  .object({
    test: z
      .object({
        id: z.uuid(),
        test_type: z.enum(["academic", "general"]),
        title: z.string(),
        min_plan: PlanTier,
        /** Always "published" for students; staff can preview drafts. */
        status: z.enum(["draft", "review", "published", "archived"]),
      })
      .strict(),
    passages: z
      .array(z.object({ id: z.uuid(), order_no: z.number().int().min(1).max(3), title: z.string(), body: z.string() }).strict())
      .max(3),
    questions: z.array(PublicReadingQuestion).max(40),
  })
  .strict();
export type ReadingTestPayload = z.infer<typeof ReadingTestPayload>;
