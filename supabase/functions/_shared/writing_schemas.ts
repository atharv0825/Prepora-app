// Zod schemas for score-writing and ocr-writing (M6-B3/B4): copies of the contract in
// packages/shared/src/api/score-writing.ts and ocr-writing.ts, which Edge Functions can't import.
// tests/contract.test.ts checks the field names and limits still match.
import { z } from "./deps.ts";
import { isHalfBand } from "./writing.ts";

const band = z.number().refine(isHalfBand, "A band is 0–9 in steps of 0.5");

export const WritingPhotoPath = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,100}$/, "Not a writing-photos path");

// ── score-writing ───────────────────────────────────────────────────────────────────────────
export const ScoreWritingInput = z
  .object({
    task_id: z.uuid(),
    text: z
      .string()
      .max(20_000, "Answers are limited to 20,000 characters")
      .refine((t) => t.trim().length > 0, "Write your answer first"),
    input_mode: z.enum(["typed", "photo"]).default("typed"),
    photo_paths: z.array(WritingPhotoPath).min(1).max(2).optional(),
    time_taken_sec: z.number().int().min(0).max(86_400).optional(),
  })
  .strict()
  .refine((r) => (r.input_mode === "photo") === (r.photo_paths !== undefined), {
    message: "Photo answers send their photo paths; typed answers don't",
    path: ["photo_paths"],
  });
export type ScoreWritingInput = z.infer<typeof ScoreWritingInput>;

export const correctionCategories = ["grammar", "vocabulary", "spelling", "punctuation", "cohesion", "style"] as const;

const paragraph = z.string().min(1).max(1500);
const point = z.string().min(1).max(400);

/** What the model must return (= ScoredWriting in the contract). */
export const ScoredWriting = z
  .object({
    scores: z.object({ ta: band, cc: band, lr: band, gra: band }).strict(),
    summary: paragraph,
    corrections: z
      .array(
        z
          .object({
            original: z.string().min(1).max(500),
            suggestion: z.string().max(500),
            category: z.enum(correctionCategories),
            explanation: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(40),
    strengths: z.array(point).min(1).max(6),
    improvements: z.array(point).min(1).max(6),
    model_answer: z.string().min(1).max(6000),
  })
  .strict();
export type ScoredWritingOutput = z.infer<typeof ScoredWriting>;

// ── ocr-writing ─────────────────────────────────────────────────────────────────────────────
export const OcrWritingInput = z
  .object({
    photo_paths: z
      .array(WritingPhotoPath)
      .min(1, "Add a photo of your answer")
      .max(2, "Up to 2 pages")
      .refine((p) => new Set(p).size === p.length, "The same photo twice"),
    task_id: z.uuid().optional(),
  })
  .strict();
export type OcrWritingInput = z.infer<typeof OcrWritingInput>;

export const OcrLegibility = z.enum(["good", "partial", "unreadable"]);

/** What the OCR model must return: one entry per photo, in order. */
export const OcrModelOutput = z
  .object({
    pages: z
      .array(z.object({ text: z.string().max(20_000), legibility: OcrLegibility }).strict())
      .min(1)
      .max(2),
  })
  .strict();
export type OcrModelOutput = z.infer<typeof OcrModelOutput>;
