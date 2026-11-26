// ocr-writing contract (M6-C2): POST /functions/v1/ocr-writing, signed in. Implemented in M6-B4.
//
// Photo flow (M6-F2): the student uploads 1–2 photos of their handwritten answer to the private
// writing-photos bucket ({user_id}/{file}, Gold/Platinum only, M6-C1), then calls this with the
// paths. The function spends 1 credit (withCredits 'ocr', which needs the plan's ocr feature),
// reads the pages with Gemini and returns the text, page by page. Nothing is scored or saved:
// the student checks and edits the text, then sends it to score-writing with
// input_mode = "photo" and the same paths.
//
// Errors (the shared { error: { code, message, details } } shape):
//   400 validation_failed      malformed body; a path outside the student's folder
//   401 unauthorized           no session
//   403 feature_not_in_plan    Free plan (photo upload is Gold/Platinum)
//   404 not_found              a photo isn't in the bucket
//   402 insufficient_credits   / 429 daily_cap_reached (details: SpendResult refusal fields)
//   500 internal               the AI failed; the credit is refunded
import { z } from "zod";
import { WritingPhotoPath } from "./score-writing";

export const OcrWritingRequest = z
  .object({
    /** In page order. */
    photo_paths: z
      .array(WritingPhotoPath)
      .min(1, "Add a photo of your answer")
      .max(2, "Up to 2 pages")
      .refine((p) => new Set(p).size === p.length, "The same photo twice"),
    /** The task being answered, to help read task-specific words (optional). */
    task_id: z.uuid().optional(),
  })
  .strict();
export type OcrWritingRequest = z.infer<typeof OcrWritingRequest>;

/**
 * How readable the page was. "partial": some words were guessed and marked [?] in the text, so
 * the student should check them; "unreadable": no handwriting found (wrong photo, too blurry).
 */
export const OcrLegibility = z.enum(["good", "partial", "unreadable"]);
export type OcrLegibility = z.infer<typeof OcrLegibility>;

export const OcrPage = z
  .object({
    path: WritingPhotoPath,
    text: z.string().max(20_000),
    legibility: OcrLegibility,
  })
  .strict();
export type OcrPage = z.infer<typeof OcrPage>;

/** Guessed words are marked like this in the text, for the student to check. */
export const OCR_UNSURE_MARK = "[?]";

export const OcrWritingResponse = z
  .object({
    /** The pages joined with a blank line: what the editor opens with. */
    text: z.string().max(20_000),
    word_count: z.number().int().min(0),
    pages: z.array(OcrPage).min(1).max(2),
    credits_charged: z.number().int().min(0),
    balance_after: z.number().int().min(0),
  })
  .strict()
  .refine((r) => r.text === joinOcrPages(r.pages), { message: "text must be the pages joined", path: ["text"] });
export type OcrWritingResponse = z.infer<typeof OcrWritingResponse>;

/** The editor text from the pages: each page trimmed, readable pages joined with a blank line. */
export function joinOcrPages(pages: readonly Pick<OcrPage, "text">[]): string {
  return pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}
