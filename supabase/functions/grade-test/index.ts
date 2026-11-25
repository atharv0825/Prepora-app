// POST /functions/v1/grade-test (M4-B2 Reading, M5-B2 Listening).
// Contracts: packages/shared/src/api/grade-test.ts (module "reading") and
// api/listening-test.ts (module "listening": ListeningGradeRequest / ListeningGradeResponse).
//
//   1. The test must be published (404) and in the student's plan (403, details: { min_plan }).
//   2. Grade every question against the key (_shared/reading.ts), raw score → band (Reading:
//      the Academic or General table; Listening: the one Listening table).
//   3. record_test_attempt: uses one Reading/Listening allowance and saves the attempt, with its
//      results (and, for Listening, exam or practice mode), in one transaction (402
//      allowance_exceeded, nothing saved, when the month's tests are used up).
//   4. Return the results with the correct answers and explanations, and for Listening each
//      section's transcript: the first time the student sees them.
// Reads the answer key with the service role; nothing from the client is trusted but the answers.

import { z } from "../_shared/deps.ts";
import { errors, HttpError } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import type { Json } from "../_shared/db.ts";
import { createHandler } from "../_shared/handler.ts";
import { type GradableQuestion, gradeListeningTest, gradeTest, type QuestionResult, type TestType } from "../_shared/reading.ts";

// Same as GradeTestRequest (api/grade-test.ts) and ListeningGradeRequest (api/listening-test.ts).
const Answer = z.union([z.string().max(200), z.array(z.string().max(10)).max(3)]);
const common = {
  test_id: z.uuid(),
  answers: z.record(z.string().regex(/^([1-9]|[1-3]\d|40)$/), Answer),
  time_taken_sec: z.number().int().min(0).max(86_400).optional(),
};
const Input = z.discriminatedUnion("module", [
  z.object({ module: z.literal("reading"), ...common }).strict(),
  z.object({ module: z.literal("listening"), mode: z.enum(["exam", "practice"]), ...common }).strict(),
]);
type Input = z.infer<typeof Input>;
type Allowance = { type: string; used: number; limit: number };

export interface GradeTestResponse {
  attempt_id: string;
  module: "reading";
  test_id: string;
  raw_score: number;
  total: number;
  band: number;
  results: QuestionResult[];
  allowance: Allowance;
}

export interface ListeningGradeResponse extends Omit<GradeTestResponse, "module"> {
  module: "listening";
  mode: "exam" | "practice";
  transcripts: { order_no: number; title: string; transcript: string }[];
}

const PLAN_RANK: Record<string, number> = { free: 0, gold: 1, platinum: 2 };

type Db = DbClient;

async function checkPlan(db: Db, userId: string, minPlan: string) {
  const { data: profile } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const plan = profile?.plan ?? "free";
  if ((PLAN_RANK[plan] ?? 0) < (PLAN_RANK[minPlan] ?? 0)) {
    throw new HttpError(403, "forbidden", "This test is part of a higher plan", { min_plan: minPlan });
  }
}

/** Uses the allowance and saves the attempt in one transaction; 402 when the month's tests are used up. */
async function record(
  db: Db,
  args: {
    userId: string;
    module: "reading" | "listening";
    testId: string;
    questions: { q_no: number }[];
    input: Input;
    graded: { raw_score: number; band: number; results: QuestionResult[] };
    mode?: "exam" | "practice";
  },
): Promise<{ attempt_id: string; allowance: Allowance }> {
  // Keep only answers to questions that exist.
  const known = new Set(args.questions.map((q) => String(q.q_no)));
  const answers = Object.fromEntries(Object.entries(args.input.answers).filter(([k]) => known.has(k)));

  const { data: saved, error: saveError } = await db.rpc("record_test_attempt", {
    p_user_id: args.userId,
    p_module: args.module,
    p_test_id: args.testId,
    p_answers: answers,
    p_raw_score: args.graded.raw_score,
    p_band: args.graded.band,
    p_time_taken_sec: args.input.time_taken_sec,
    // Kept with the attempt so the student can review it later (M4-F4).
    p_results: args.graded.results as unknown as Json,
    p_mode: args.mode,
  });
  if (saveError) throw new Error(`record_test_attempt: ${saveError.code} ${saveError.message}`);

  const result = saved as
    | { ok: true; attempt_id: string; allowance: Allowance }
    | { ok: false; code: string; type: string; used: number; limit: number };
  if (!result.ok) {
    const { ok: _ok, code: _code, ...details } = result;
    const name = args.module === "reading" ? "Reading" : "Listening";
    throw new HttpError(402, "allowance_exceeded", `This month's ${name} tests are used up`, details);
  }
  return { attempt_id: result.attempt_id, allowance: result.allowance };
}

async function gradeReading(db: Db, userId: string, input: Input & { module: "reading" }): Promise<GradeTestResponse> {
  // 1. The test, and whether this student may take it.
  const { data: test, error: testError } = await db
    .from("reading_tests")
    .select("id, test_type, status, min_plan")
    .eq("id", input.test_id)
    .maybeSingle();
  if (testError) throw new Error(`reading_tests: ${testError.code} ${testError.message}`);
  if (!test || test.status !== "published") throw errors.notFound("Test not found");
  await checkPlan(db, userId, test.min_plan);

  // 2. Grade.
  const { data: questions, error: qError } = await db
    .from("reading_questions")
    .select("q_no, q_type, options, answer, explanation")
    .eq("test_id", test.id)
    .order("q_no");
  if (qError) throw new Error(`reading_questions: ${qError.code} ${qError.message}`);
  if (!questions?.length) throw errors.notFound("Test not found");
  const graded = gradeTest(test.test_type as TestType, questions as GradableQuestion[], input.answers);

  // 3. Allowance + save, atomically. 4. Results.
  const saved = await record(db, { userId, module: "reading", testId: test.id, questions, input, graded });
  return {
    attempt_id: saved.attempt_id,
    module: "reading",
    test_id: test.id,
    raw_score: graded.raw_score,
    total: graded.total,
    band: graded.band,
    results: graded.results,
    allowance: saved.allowance,
  };
}

async function gradeListening(db: Db, userId: string, input: Input & { module: "listening" }): Promise<ListeningGradeResponse> {
  const { data: test, error: testError } = await db
    .from("listening_tests")
    .select("id, status, min_plan")
    .eq("id", input.test_id)
    .maybeSingle();
  if (testError) throw new Error(`listening_tests: ${testError.code} ${testError.message}`);
  if (!test || test.status !== "published") throw errors.notFound("Test not found");
  await checkPlan(db, userId, test.min_plan);

  const [{ data: questions, error: qError }, { data: sections, error: sError }] = await Promise.all([
    db.from("listening_questions").select("q_no, q_type, options, answer, explanation").eq("test_id", test.id).order("q_no"),
    db.from("listening_sections").select("order_no, title, transcript").eq("test_id", test.id).order("order_no"),
  ]);
  if (qError) throw new Error(`listening_questions: ${qError.code} ${qError.message}`);
  if (sError) throw new Error(`listening_sections: ${sError.code} ${sError.message}`);
  if (!questions?.length) throw errors.notFound("Test not found");
  const graded = gradeListeningTest(questions as GradableQuestion[], input.answers);

  const saved = await record(db, { userId, module: "listening", testId: test.id, questions, input, graded, mode: input.mode });
  return {
    attempt_id: saved.attempt_id,
    module: "listening",
    test_id: test.id,
    mode: input.mode,
    raw_score: graded.raw_score,
    total: graded.total,
    band: graded.band,
    results: graded.results,
    // Only now: the transcripts would have given the answers away.
    transcripts: (sections ?? []).map((s) => ({ order_no: s.order_no, title: s.title, transcript: s.transcript ?? "" })),
    allowance: saved.allowance,
  };
}

Deno.serve(
  createHandler(
    { name: "grade-test", methods: ["POST"], auth: "required", input: Input },
    async ({ input, user, admin }): Promise<GradeTestResponse | ListeningGradeResponse> => {
      const db = admin();
      return input.module === "reading" ? await gradeReading(db, user!.id, input) : await gradeListening(db, user!.id, input);
    },
  ),
);
