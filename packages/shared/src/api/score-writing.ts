// score-writing contract (M6-C2): POST /functions/v1/score-writing, signed in. Implemented in M6-B3.
//
// The student sends their answer to a published Writing task (typed, or the OCR text they
// checked). The function spends the task's credits (withCredits 'writing_t1' / 'writing_t2'),
// asks Gemini to score it against the rubric, validates the model's JSON with ScoredWriting,
// recomputes the band from the four criteria (writingTaskBand), saves a writing_submissions row
// and returns the feedback. If the AI fails, the credits are refunded and nothing is saved.
//
// Free plans (plans.limits.detailed_feedback = false) get the SUMMARY shape: the four criteria,
// the band, one paragraph and how many corrections were found, but not the corrections,
// strengths, improvements or model answer. The row stores the same trimmed feedback
// (toWritingSummary), so the full version can't be read from the table either (M6-C1).
//
// Errors (the shared { error: { code, message, details } } shape):
//   400 validation_failed      malformed body; photo paths outside the student's folder
//   401 unauthorized           no session
//   404 not_found              no such published task
//   402 insufficient_credits   (details: SpendResult refusal fields, M3-C3)
//   429 daily_cap_reached      (details: idem)
//   500 internal               the AI failed or returned something unusable; credits refunded
import { z } from "zod";
import { isHalfBand, writingTaskBand } from "../ielts/writing";

const band = z.number().refine(isHalfBand, "A band is 0–9 in steps of 0.5");

/** Storage path in writing-photos: {user_id}/{file}. score-writing checks the folder is the caller's. */
export const WritingPhotoPath = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,100}$/, "Not a writing-photos path");

export const WritingInputMode = z.enum(["typed", "photo"]);
export type WritingInputMode = z.infer<typeof WritingInputMode>;

export const ScoreWritingRequest = z
  .object({
    task_id: z.uuid(),
    /** The answer as it should be scored. The word count is computed by the function. */
    text: z
      .string()
      .max(20_000, "Answers are limited to 20,000 characters")
      .refine((t) => t.trim().length > 0, "Write your answer first"),
    input_mode: WritingInputMode.default("typed"),
    /** The photos the text was read from (ocr-writing), 1–2 pages; photo answers only. */
    photo_paths: z.array(WritingPhotoPath).min(1).max(2).optional(),
    /** Seconds on the editor's timer; stored, not trusted for anything else. */
    time_taken_sec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict()
  .refine((r) => (r.input_mode === "photo") === (r.photo_paths !== undefined), {
    message: "Photo answers send their photo paths; typed answers don't",
    path: ["photo_paths"],
  });
export type ScoreWritingRequest = z.input<typeof ScoreWritingRequest>;

export const WritingScoresSchema = z.object({ ta: band, cc: band, lr: band, gra: band }).strict();

export const correctionCategories = ["grammar", "vocabulary", "spelling", "punctuation", "cohesion", "style"] as const;

/**
 * One inline correction. `original` is copied exactly from the answer, so the screen can
 * highlight its first occurrence (score-writing drops corrections whose text isn't found:
 * models are unreliable with character offsets, reliable with quotes).
 */
export const WritingCorrection = z
  .object({
    original: z.string().min(1).max(500),
    suggestion: z.string().max(500),
    category: z.enum(correctionCategories),
    explanation: z.string().min(1).max(500),
  })
  .strict();
export type WritingCorrection = z.infer<typeof WritingCorrection>;

const paragraph = z.string().min(1).max(1500);
const point = z.string().min(1).max(400);

/** Full feedback, as the model must return it (validated in M6-B3) and Gold/Platinum store it. */
export const ScoredWriting = z
  .object({
    scores: WritingScoresSchema,
    /** One paragraph: the overall verdict. Shown on every plan. */
    summary: paragraph,
    corrections: z.array(WritingCorrection).max(40),
    strengths: z.array(point).min(1).max(6),
    improvements: z.array(point).min(1).max(6),
    /** A band-9 rewrite of the answer (or a model answer to the task). */
    model_answer: z.string().min(1).max(6000),
  })
  .strict();
export type ScoredWriting = z.infer<typeof ScoredWriting>;

/** What writing_submissions.feedback holds (M6-C1): the full feedback, or the Free summary. */
export const WritingFeedback = z.discriminatedUnion("detail", [
  z
    .object({
      detail: z.literal("full"),
      summary: paragraph,
      corrections: z.array(WritingCorrection),
      strengths: z.array(point),
      improvements: z.array(point),
      model_answer: z.string().min(1),
    })
    .strict(),
  z
    .object({
      detail: z.literal("summary"),
      summary: paragraph,
      /** How many corrections the full feedback has: the upgrade prompt says so. */
      corrections_count: z.number().int().min(0),
    })
    .strict(),
]);
export type WritingFeedback = z.infer<typeof WritingFeedback>;

const common = {
  submission_id: z.uuid(),
  task_id: z.uuid(),
  task_no: z.union([z.literal(1), z.literal(2)]),
  word_count: z.number().int().min(0),
  /** 150 for Task 1, 250 for Task 2. */
  min_words: z.number().int().min(1),
  scores: WritingScoresSchema,
  band,
  /** Credits this scoring cost and the balance after it (for the header and the next confirm). */
  credits_charged: z.number().int().min(0),
  balance_after: z.number().int().min(0),
};

export const ScoreWritingResponse = z
  .discriminatedUnion("detail", [
    z
      .object({
        ...common,
        detail: z.literal("full"),
        summary: paragraph,
        corrections: z.array(WritingCorrection),
        strengths: z.array(point),
        improvements: z.array(point),
        model_answer: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ...common,
        detail: z.literal("summary"),
        summary: paragraph,
        corrections_count: z.number().int().min(0),
      })
      .strict(),
  ])
  .refine((r) => r.band === writingTaskBand(r.scores), {
    message: "band must be the criteria's average rounded down to a half band",
    path: ["band"],
  });
export type ScoreWritingResponse = z.infer<typeof ScoreWritingResponse>;
export type FullScoreWritingResponse = Extract<ScoreWritingResponse, { detail: "full" }>;
export type SummaryScoreWritingResponse = Extract<ScoreWritingResponse, { detail: "summary" }>;

/** The stored and returned feedback for a plan: full with detailed_feedback, else the summary. */
export function writingFeedbackFor(scored: ScoredWriting, detailedFeedback: boolean): WritingFeedback {
  if (detailedFeedback) {
    const { scores: _scores, ...rest } = scored;
    return { detail: "full", ...rest };
  }
  return toWritingSummary(scored);
}

/** The Free shape: summary and correction count only. */
export function toWritingSummary(scored: Pick<ScoredWriting, "summary" | "corrections">): Extract<WritingFeedback, { detail: "summary" }> {
  return { detail: "summary", summary: scored.summary, corrections_count: scored.corrections.length };
}
