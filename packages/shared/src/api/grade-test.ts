// grade-test contract (M4-C2): POST /functions/v1/grade-test, signed in. Implemented in M4-B2.
//
// The player sends the student's answers; the function checks the student may take the test
// (published, plan ≥ min_plan), uses one Reading allowance (use_allowance, M3-B3), grades every
// question (ielts/reading.ts rules), converts the raw score to a band (ielts/bands.ts), saves a
// test_attempts row and returns the results, with the correct answers and explanations, which
// students see only now.
//
// Errors (the shared { error: { code, message, details } } shape):
//   400 validation_failed      malformed body
//   401 unauthorized           no session
//   403 forbidden              the test needs a higher plan (details: { min_plan })
//   404 not_found              no such published test
//   402 allowance_exceeded     this month's Reading tests are used (details: AllowanceResult fields)
import { z } from "zod";
import { AllowanceUsage } from "./credits";
import { ReadingQuestionTypeSchema, ReadingResponse } from "../ielts/reading";

export const GradeTestRequest = z
  .object({
    module: z.literal("reading"),
    test_id: z.uuid(),
    /** By question number ("1".."40"). Unanswered questions may be left out or sent as "". */
    answers: z.record(z.string().regex(/^([1-9]|[1-3]\d|40)$/, "Question numbers are 1–40"), ReadingResponse),
    /** Seconds the student spent (the player's timer); stored, not trusted for anything else. */
    time_taken_sec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict();
export type GradeTestRequest = z.infer<typeof GradeTestRequest>;

/** One question's result. */
export const QuestionResult = z
  .object({
    q_no: z.number().int().min(1).max(40),
    q_type: ReadingQuestionTypeSchema,
    correct: z.boolean(),
    /** What the student answered (null = unanswered). */
    given: ReadingResponse.nullable(),
    /** The correct answer as shown: letters, a label, or the first accepted text. */
    correct_answer: z.union([z.string(), z.array(z.string())]),
    /** Other accepted spellings for typed answers. */
    also_accepted: z.array(z.string()).default([]),
    /** Why typed answers over the word limit were marked wrong, etc. */
    note: z.enum(["over_word_limit", "unanswered"]).nullable().default(null),
    explanation: z.string().nullable(),
  })
  .strict();
export type QuestionResult = z.infer<typeof QuestionResult>;

export const GradeTestResponse = z
  .object({
    attempt_id: z.uuid(),
    module: z.literal("reading"),
    test_id: z.uuid(),
    raw_score: z.number().int().min(0).max(40),
    /** Questions in the test (40 in a full test; samples can be shorter, and are scaled). */
    total: z.number().int().min(1).max(40),
    band: z.number().min(0).max(9).multipleOf(0.5),
    results: z.array(QuestionResult),
    /** The Reading allowance after this test. */
    allowance: AllowanceUsage,
  })
  .strict();
export type GradeTestResponse = z.infer<typeof GradeTestResponse>;
