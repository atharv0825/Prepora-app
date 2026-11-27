// Listening contract (M5-C2; the player's part was written with M5-F1..F3): question types, the
// map/diagram labelling shapes, the stored-question validator for all 13 types, the section
// layout and the band table. Stored in listening_questions (M5-C1).
//
// Listening reuses the 11 Reading question types (ielts/reading.ts: same options, answers and
// typed-answer rules) and adds two labelling types:
//
//   * map_labelling      a plan or map with lettered places (A, B, C…). The question names a
//                        place ("Café"); the student answers with the letter where it is.
//   * diagram_labelling  a diagram with the question's number at a point. The student types the
//                        label (word limit, like a completion gap) or picks it from a word bank.
//
// Questions that share an image (same image_url) are shown together: one picture, all their
// markers, the questions beside it. Marker positions are percentages of the image's width and
// height, so they stay put at any size.
//
// A full test is 4 sections (parts) of 10 questions: 1–10, 11–20, 21–30, 31–40.
import { z } from "zod";
import type { Database } from "../db";
import { scaledRawScore } from "./bands";
import {
  answerLabels,
  letterLabel,
  parseReadingQuestion,
  type ReadingQuestionContent,
  type ReadingQuestionType,
  readingQuestionTypes,
  TextAnswer,
  TextOptions,
} from "./reading";

export const listeningQuestionTypes = [
  ...readingQuestionTypes,
  "map_labelling",
  "diagram_labelling",
] as const satisfies readonly Database["public"]["Enums"]["listening_question_type"][];
export type ListeningQuestionType = (typeof listeningQuestionTypes)[number];
export const ListeningQuestionTypeSchema = z.enum(listeningQuestionTypes);

export const labellingTypes = ["map_labelling", "diagram_labelling"] as const;
export type LabellingType = (typeof labellingTypes)[number];
export const isLabelling = (t: string): t is LabellingType => (labellingTypes as readonly string[]).includes(t);

// ── Sections ────────────────────────────────────────────────────────────────────────────────
export const LISTENING_SECTIONS = 4;
export const QUESTIONS_PER_SECTION = 10;

/** Question 1–10 → section 1, 11–20 → 2, 21–30 → 3, 31–40 → 4. */
export function sectionOfQuestion(qNo: number): number {
  if (!Number.isInteger(qNo) || qNo < 1 || qNo > LISTENING_SECTIONS * QUESTIONS_PER_SECTION) {
    throw new RangeError(`no question ${qNo}`);
  }
  return Math.ceil(qNo / QUESTIONS_PER_SECTION);
}

/** The question numbers of a section: 2 → [11 … 20]. */
export function sectionQuestionNumbers(section: number): number[] {
  if (!Number.isInteger(section) || section < 1 || section > LISTENING_SECTIONS) throw new RangeError(`no section ${section}`);
  return Array.from({ length: QUESTIONS_PER_SECTION }, (_, i) => (section - 1) * QUESTIONS_PER_SECTION + i + 1);
}

// ── Labelling ───────────────────────────────────────────────────────────────────────────────
const percent = z.number().min(0).max(100);
/** A point on the image, in % of its width (x) and height (y) from the top-left corner. */
export const ImagePoint = z.object({ x: percent, y: percent }).strict();
export type ImagePoint = z.infer<typeof ImagePoint>;

const image = {
  /** Public URL of the plan, map or diagram (M5-B3 storage). */
  image_url: z.url(),
  /** What the picture shows, for screen readers. */
  image_alt: z.string().trim().min(1).max(300),
};

/** A lettered place on a map: A, B, C… in order. */
export const MapLocation = ImagePoint.extend({ label: z.string().regex(/^[A-Z]$/) }).strict();
export type MapLocation = z.infer<typeof MapLocation>;

export const MapLabellingOptions = z
  .object({
    ...image,
    /** The lettered places, drawn over the image. Labels A, B, C… in order. */
    locations: z.array(MapLocation).min(2).max(12),
  })
  .strict()
  .superRefine((o, ctx) => {
    o.locations.forEach((l, i) => {
      if (l.label !== letterLabel(i)) ctx.addIssue({ code: "custom", path: ["locations", i, "label"], message: `Expected ${letterLabel(i)}` });
    });
  });
export type MapLabellingOptions = z.infer<typeof MapLabellingOptions>;

const MapLabelling = z
  .object({
    q_type: z.literal("map_labelling"),
    /** The place to find, e.g. "Café". */
    prompt: z.string().trim().min(1).max(300),
    options: MapLabellingOptions,
    answer: z.object({ label: z.string().regex(/^[A-Z]$/) }).strict(),
  })
  .superRefine((q, ctx) => {
    if (!q.options.locations.some((l) => l.label === q.answer.label)) {
      ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the map's letters" });
    }
  });

/** Diagram labelling, typed: where the question number sits, and the word limit. */
export const DiagramLabellingTextOptions = TextOptions.extend({ ...image, marker: ImagePoint }).strict();
/** Diagram labelling from a word bank (A, B, C…). */
export const DiagramLabellingBankOptions = z
  .object({ ...image, marker: ImagePoint, word_bank: z.array(z.string().trim().min(1).max(100)).min(2).max(15) })
  .strict();
export type DiagramLabellingOptions = z.infer<typeof DiagramLabellingTextOptions> | z.infer<typeof DiagramLabellingBankOptions>;

const DiagramLabelling = z.union([
  z.object({
    q_type: z.literal("diagram_labelling"),
    /** The part being labelled, often just the number's context, e.g. "Water enters through the ___". */
    prompt: z.string().trim().min(1).max(300),
    options: DiagramLabellingTextOptions,
    answer: TextAnswer,
  }),
  z
    .object({
      q_type: z.literal("diagram_labelling"),
      prompt: z.string().trim().min(1).max(300),
      options: DiagramLabellingBankOptions,
      answer: z.object({ label: z.string().regex(/^[A-Z]$/) }).strict(),
    })
    .superRefine((q, ctx) => {
      if (!q.options.word_bank.some((_, i) => letterLabel(i) === q.answer.label)) {
        ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the words (A, B, …)" });
      }
    }),
]);

/** A labelling question as stored (prompt, options, answer). The other types use ReadingQuestionContent. */
export const LabellingQuestionContent = z.union([MapLabelling, DiagramLabelling]);
export type LabellingQuestionContent = z.infer<typeof LabellingQuestionContent>;

/** One stored Listening question (prompt, options, answer), any of the 13 types. */
export type ListeningQuestionContent = ReadingQuestionContent | LabellingQuestionContent;

/**
 * Validate one stored Listening question; reports the problems of its own type only. The 11
 * Reading types follow the Reading contract exactly (same options, answers and marking).
 */
export function parseListeningQuestion(input: { q_type: string; prompt: unknown; options: unknown; answer: unknown }):
  | { success: true; data: ListeningQuestionContent }
  | { success: false; error: z.ZodError } {
  const type = ListeningQuestionTypeSchema.safeParse(input.q_type);
  if (!type.success) return { success: false, error: type.error };
  if (isLabelling(type.data)) {
    const parsed = LabellingQuestionContent.safeParse(input);
    return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error };
  }
  const parsed = parseReadingQuestion(input);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: parsed.error };
}

/** The labels a student can answer with (empty for typed answers), for every Listening type. */
export function listeningAnswerLabels(q: { q_type: ListeningQuestionType; options: Record<string, unknown> }): string[] {
  if (q.q_type === "map_labelling") {
    return Array.isArray(q.options.locations)
      ? (q.options.locations as unknown[]).flatMap((l) => (l && typeof (l as { label?: unknown }).label === "string" ? [(l as { label: string }).label] : []))
      : [];
  }
  if (q.q_type === "diagram_labelling") return answerLabels({ q_type: "summary_completion", options: q.options });
  return answerLabels({ q_type: q.q_type as ReadingQuestionType, options: q.options });
}

/** What a labelling question's options look like to the player (no answer in them). */
export function labellingImage(options: Record<string, unknown>): { url: string; alt: string } | null {
  const url = options.image_url;
  const alt = options.image_alt;
  return typeof url === "string" && url ? { url, alt: typeof alt === "string" ? alt : "" } : null;
}

// ── Bands ───────────────────────────────────────────────────────────────────────────────────
// The commonly published IELTS Listening conversion. Unlike Reading, Academic and General
// Training take the same Listening test and use one table. As with Reading, the rows below 2.5
// are our extension, and the result is a practice estimate.
export const LISTENING_BANDS: readonly (readonly [minRaw: number, band: number])[] = [
  [39, 9],
  [37, 8.5],
  [35, 8],
  [32, 7.5],
  [30, 7],
  [26, 6.5],
  [23, 6],
  [18, 5.5],
  [16, 5],
  [13, 4.5],
  [10, 4],
  [8, 3.5],
  [6, 3],
  [4, 2.5],
  // Below the published table.
  [2, 2],
  [1, 1],
  [0, 0],
];

/** Band for a Listening raw score out of `total` (short tests are scaled to 40, rounding down). */
export function listeningBand(raw: number, total = LISTENING_SECTIONS * QUESTIONS_PER_SECTION): number {
  const scaled = scaledRawScore(raw, total);
  const row = LISTENING_BANDS.find(([min]) => scaled >= min);
  return row ? row[1] : 0;
}
