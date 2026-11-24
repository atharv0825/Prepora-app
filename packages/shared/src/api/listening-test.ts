// Listening test contract (written with M5-F1..F3; the backend follows in M5-C1 / M5-B2):
//
//   * ListeningTestPayload: what the player loads (get_listening_test, like get_reading_test in
//     M4-B1). Sections carry their audio; questions never carry answers, and transcripts are
//     NOT sent before submission.
//   * ListeningGradeResponse: what grade-test returns for module = "listening" (M5-B2): the
//     Reading result shape plus each section's transcript, shown only after submission.
import { z } from "zod";
import { AllowanceUsage, PlanTier } from "./credits";
import { ListeningQuestionTypeSchema } from "../ielts/listening";
import { ReadingResponse } from "../ielts/reading";

export const ListeningSection = z
  .object({
    id: z.uuid(),
    order_no: z.number().int().min(1).max(4),
    title: z.string(),
    /** Public CDN URL of the recording (M5-B1). */
    audio_url: z.url(),
    /** Length in seconds when known (the builder stores it on upload); the player reads it from the file otherwise. */
    duration_sec: z.number().int().min(1).max(3600).nullable(),
  })
  .strict();
export type ListeningSection = z.infer<typeof ListeningSection>;

export const PublicListeningQuestion = z
  .object({
    id: z.uuid(),
    section_id: z.uuid(),
    q_no: z.number().int().min(1).max(40),
    q_type: ListeningQuestionTypeSchema,
    prompt: z.string(),
    options: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PublicListeningQuestion = z.infer<typeof PublicListeningQuestion>;

export const ListeningTestPayload = z
  .object({
    test: z
      .object({
        id: z.uuid(),
        title: z.string(),
        min_plan: PlanTier,
        status: z.enum(["draft", "review", "published", "archived"]),
      })
      .strict(),
    sections: z.array(ListeningSection).min(1).max(4),
    questions: z.array(PublicListeningQuestion).max(40),
  })
  .strict();
export type ListeningTestPayload = z.infer<typeof ListeningTestPayload>;

/** How the test was taken. Stored with the attempt; exam mode is the one that predicts a band. */
export const ListeningMode = z.enum(["exam", "practice"]);
export type ListeningMode = z.infer<typeof ListeningMode>;

export const ListeningGradeRequest = z
  .object({
    module: z.literal("listening"),
    test_id: z.uuid(),
    mode: ListeningMode,
    answers: z.record(z.string().regex(/^([1-9]|[1-3]\d|40)$/, "Question numbers are 1–40"), ReadingResponse),
    time_taken_sec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict();
export type ListeningGradeRequest = z.infer<typeof ListeningGradeRequest>;

export const ListeningQuestionResult = z
  .object({
    q_no: z.number().int().min(1).max(40),
    q_type: ListeningQuestionTypeSchema,
    correct: z.boolean(),
    given: ReadingResponse.nullable(),
    correct_answer: z.union([z.string(), z.array(z.string())]),
    also_accepted: z.array(z.string()).default([]),
    note: z.enum(["over_word_limit", "unanswered"]).nullable().default(null),
    explanation: z.string().nullable(),
  })
  .strict();
export type ListeningQuestionResult = z.infer<typeof ListeningQuestionResult>;

export const ListeningGradeResponse = z
  .object({
    attempt_id: z.uuid(),
    module: z.literal("listening"),
    test_id: z.uuid(),
    mode: ListeningMode,
    raw_score: z.number().int().min(0).max(40),
    total: z.number().int().min(1).max(40),
    band: z.number().min(0).max(9).multipleOf(0.5),
    results: z.array(ListeningQuestionResult),
    /** Each section's transcript: first sent here, after submission. */
    transcripts: z.array(z.object({ order_no: z.number().int().min(1).max(4), title: z.string(), transcript: z.string() }).strict()),
    allowance: AllowanceUsage,
  })
  .strict();
export type ListeningGradeResponse = z.infer<typeof ListeningGradeResponse>;
