// POST /functions/v1/grade-test (M4-B2). Contract: packages/shared/src/api/grade-test.ts.
//
//   1. The test must be published (404) and in the student's plan (403, details: { min_plan }).
//   2. Grade every question against the key (_shared/reading.ts), raw score → band.
//   3. record_test_attempt: uses one Reading allowance and saves the attempt, with its results
//      for reviewing later, in one transaction (402 allowance_exceeded, nothing saved, when the
//      month's tests are used up).
//   4. Return the results with the correct answers and explanations: the first time the
//      student sees them.
// Reads the answer key with the service role; nothing from the client is trusted but the answers.

import { z } from "../_shared/deps.ts";
import { errors, HttpError } from "../_shared/errors.ts";
import type { Json } from "../_shared/db.ts";
import { createHandler } from "../_shared/handler.ts";
import { type GradableQuestion, gradeTest, type QuestionResult, type TestType } from "../_shared/reading.ts";

// Same as GradeTestRequest in packages/shared/src/api/grade-test.ts.
const Answer = z.union([z.string().max(200), z.array(z.string().max(10)).max(3)]);
const Input = z
  .object({
    module: z.literal("reading"),
    test_id: z.uuid(),
    answers: z.record(z.string().regex(/^([1-9]|[1-3]\d|40)$/), Answer),
    time_taken_sec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict();

export interface GradeTestResponse {
  attempt_id: string;
  module: "reading";
  test_id: string;
  raw_score: number;
  total: number;
  band: number;
  results: QuestionResult[];
  allowance: { type: string; used: number; limit: number };
}

const PLAN_RANK: Record<string, number> = { free: 0, gold: 1, platinum: 2 };

Deno.serve(
  createHandler(
    { name: "grade-test", methods: ["POST"], auth: "required", input: Input },
    async ({ input, user, admin }): Promise<GradeTestResponse> => {
      const db = admin();
      const userId = user!.id;

      // 1. The test, and whether this student may take it.
      const { data: test, error: testError } = await db
        .from("reading_tests")
        .select("id, test_type, status, min_plan")
        .eq("id", input.test_id)
        .maybeSingle();
      if (testError) throw new Error(`reading_tests: ${testError.code} ${testError.message}`);
      if (!test || test.status !== "published") throw errors.notFound("Test not found");

      const { data: profile } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
      const plan = profile?.plan ?? "free";
      if ((PLAN_RANK[plan] ?? 0) < (PLAN_RANK[test.min_plan] ?? 0)) {
        throw new HttpError(403, "forbidden", "This test is part of a higher plan", { min_plan: test.min_plan });
      }

      // 2. Grade.
      const { data: questions, error: qError } = await db
        .from("reading_questions")
        .select("q_no, q_type, options, answer, explanation")
        .eq("test_id", test.id)
        .order("q_no");
      if (qError) throw new Error(`reading_questions: ${qError.code} ${qError.message}`);
      if (!questions?.length) throw errors.notFound("Test not found");

      const graded = gradeTest(test.test_type as TestType, questions as GradableQuestion[], input.answers);

      // Keep only answers to questions that exist.
      const known = new Set(questions.map((q) => String(q.q_no)));
      const answers = Object.fromEntries(Object.entries(input.answers).filter(([k]) => known.has(k)));

      // 3. Allowance + save, atomically.
      const { data: saved, error: saveError } = await db.rpc("record_test_attempt", {
        p_user_id: userId,
        p_module: "reading",
        p_test_id: test.id,
        p_answers: answers,
        p_raw_score: graded.raw_score,
        p_band: graded.band,
        p_time_taken_sec: input.time_taken_sec,
        // Kept with the attempt so the student can review it later (M4-F4).
        p_results: graded.results as unknown as Json,
      });
      if (saveError) throw new Error(`record_test_attempt: ${saveError.code} ${saveError.message}`);

      const result = saved as
        | { ok: true; attempt_id: string; allowance: { type: string; used: number; limit: number } }
        | { ok: false; code: string; type: string; used: number; limit: number };
      if (!result.ok) {
        const { ok: _ok, code: _code, ...details } = result;
        throw new HttpError(402, "allowance_exceeded", "This month's Reading tests are used up", details);
      }

      // 4. Results.
      return {
        attempt_id: result.attempt_id,
        module: "reading",
        test_id: test.id,
        raw_score: graded.raw_score,
        total: graded.total,
        band: graded.band,
        results: graded.results,
        allowance: result.allowance,
      };
    },
  ),
);
