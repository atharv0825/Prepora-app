// Reading question contract (M4-C2): for each of the 11 question types, the shape of
// reading_questions.prompt / options / answer, and of a student's response.
//
// Used by the admin builder (M4-A1) to validate before saving, by the test player (M4-F3) to
// render options and check word limits, and by grade-test (M4-B2, a copy kept in sync by
// tests/contract.test.ts) to grade. options never contains the answer: students can read it.
//
// Labels students see and answer with:
//   * letters A, B, C… for MCQ choices, matching features and summary word banks;
//   * lower-case roman numerals i, ii, iii… for matching headings (as in the IELTS test);
//   * paragraph letters given by the passage for matching information.
//
// Completion types (sentence, summary, note/table, flow-chart) put exactly one gap, written
// "___" (three or more underscores), in the prompt; the student types what fills it.
import { z } from "zod";
import type { Database } from "../db";

export type ReadingQuestionType = Database["public"]["Enums"]["reading_question_type"];

export const readingQuestionTypes = [
  "mcq",
  "tfng",
  "ynng",
  "matching_headings",
  "matching_information",
  "matching_features",
  "sentence_completion",
  "summary_completion",
  "note_table_completion",
  "flowchart_completion",
  "short_answer",
] as const satisfies readonly ReadingQuestionType[];

export const ReadingQuestionTypeSchema = z.enum(readingQuestionTypes);

/** How the builder and results page name each type. */
export const readingQuestionTypeLabels: Record<ReadingQuestionType, string> = {
  mcq: "Multiple choice",
  tfng: "True / False / Not Given",
  ynng: "Yes / No / Not Given",
  matching_headings: "Matching headings",
  matching_information: "Matching information",
  matching_features: "Matching features",
  sentence_completion: "Sentence completion",
  summary_completion: "Summary completion",
  note_table_completion: "Note / table completion",
  flowchart_completion: "Flow-chart completion",
  short_answer: "Short answer",
};

// ── Labels ──────────────────────────────────────────────────────────────────────────────────
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];

/** 0 → "A", 1 → "B", … */
export function letterLabel(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= 26) throw new RangeError(`no letter for ${index}`);
  return String.fromCharCode(65 + index);
}

/** 0 → "i", 1 → "ii", … (up to xv). */
export function romanLabel(index: number): string {
  const label = ROMAN[index];
  if (!label) throw new RangeError(`no numeral for ${index}`);
  return label;
}

// ── Building blocks ─────────────────────────────────────────────────────────────────────────
const itemText = z.string().trim().min(1).max(300);
const list = (min: number, max: number) => z.array(itemText).min(min).max(max);

/** Word limit for typed answers: "NO MORE THAN TWO WORDS AND/OR A NUMBER" = { max_words: 2, number_allowed: true }. */
export const TextOptions = z
  .object({
    max_words: z.number().int().min(1).max(5),
    /** One number (digits) may be added and doesn't count toward max_words. */
    number_allowed: z.boolean().default(false),
  })
  .strict();
export type TextOptions = z.infer<typeof TextOptions>;

/** Accepted answers for a typed gap, compared after normalizeText(). The first is shown as "the" answer. */
export const TextAnswer = z
  .object({ accept: z.array(z.string().trim().min(1).max(100)).min(1).max(10) })
  .strict();
export type TextAnswer = z.infer<typeof TextAnswer>;

const LabelAnswer = z.object({ label: z.string().min(1).max(10) }).strict();

const promptText = z.string().trim().min(1).max(2000);
const GAP = /_{3,}/g;
const withOneGap = promptText.refine((p) => (p.match(GAP) ?? []).length === 1, {
  message: 'A completion prompt needs exactly one gap, written "___"',
});

/** Paragraph labels a passage uses for matching information: A, B, C… */
const paragraphLabel = z.string().regex(/^[A-Z]$/, "Paragraph labels are single capital letters");

// ── The 11 types ────────────────────────────────────────────────────────────────────────────
// Each has: prompt, options (what students see), answer (the key).

const Mcq = z
  .object({
    q_type: z.literal("mcq"),
    prompt: promptText,
    options: z
      .object({
        choices: list(2, 8),
        /** How many letters to choose ("Choose TWO letters"). */
        select: z.number().int().min(1).max(3).default(1),
      })
      .strict(),
    answer: z.object({ labels: z.array(z.string()).min(1).max(3) }).strict(),
  })
  .superRefine((q, ctx) => {
    const valid = q.options.choices.map((_, i) => letterLabel(i));
    const { labels } = q.answer;
    if (labels.length !== q.options.select) ctx.addIssue({ code: "custom", path: ["answer", "labels"], message: `Choose exactly ${q.options.select}` });
    if (new Set(labels).size !== labels.length) ctx.addIssue({ code: "custom", path: ["answer", "labels"], message: "A letter is repeated" });
    if (labels.some((l) => !valid.includes(l))) ctx.addIssue({ code: "custom", path: ["answer", "labels"], message: `Letters must be ${valid.join(", ")}` });
  });

const Tfng = z
  .object({
    q_type: z.literal("tfng"),
    prompt: promptText,
    options: z.object({}).strict(),
    answer: z.object({ value: z.enum(["true", "false", "not_given"]) }).strict(),
  });

const Ynng = z
  .object({
    q_type: z.literal("ynng"),
    prompt: promptText,
    options: z.object({}).strict(),
    answer: z.object({ value: z.enum(["yes", "no", "not_given"]) }).strict(),
  });

const MatchingHeadings = z
  .object({
    q_type: z.literal("matching_headings"),
    /** Which paragraph or section to give a heading to, e.g. "Paragraph B". */
    prompt: promptText,
    options: z.object({ headings: list(2, 15) }).strict(),
    answer: LabelAnswer,
  })
  .superRefine((q, ctx) => {
    if (!q.options.headings.some((_, i) => romanLabel(i) === q.answer.label)) {
      ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the headings (i, ii, …)" });
    }
  });

const MatchingInformation = z
  .object({
    q_type: z.literal("matching_information"),
    /** The piece of information to locate, e.g. "a reference to the cost of the project". */
    prompt: promptText,
    options: z
      .object({
        paragraphs: z.array(paragraphLabel).min(2).max(10),
        /** IELTS: "You may use any letter more than once." */
        reuse: z.boolean().default(true),
      })
      .strict(),
    answer: LabelAnswer,
  })
  .superRefine((q, ctx) => {
    if (new Set(q.options.paragraphs).size !== q.options.paragraphs.length) {
      ctx.addIssue({ code: "custom", path: ["options", "paragraphs"], message: "A paragraph is listed twice" });
    }
    if (!q.options.paragraphs.includes(q.answer.label)) {
      ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the paragraphs" });
    }
  });

const MatchingFeatures = z
  .object({
    q_type: z.literal("matching_features"),
    /** The statement to match, e.g. "argued that tourism harms the region". */
    prompt: promptText,
    options: z.object({ features: list(2, 10), reuse: z.boolean().default(true) }).strict(),
    answer: LabelAnswer,
  })
  .superRefine((q, ctx) => {
    if (!q.options.features.some((_, i) => letterLabel(i) === q.answer.label)) {
      ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the features (A, B, …)" });
    }
  });

/** A typed gap with a word limit. */
function textGap<T extends ReadingQuestionType>(type: T, prompt: z.ZodType<string>) {
  return z
    .object({ q_type: z.literal(type), prompt, options: TextOptions, answer: TextAnswer })
    .superRefine((q, ctx) => {
      q.answer.accept.forEach((a, i) => {
        if (!withinWordLimit(a, q.options)) {
          ctx.addIssue({ code: "custom", path: ["answer", "accept", i], message: "Longer than the word limit" });
        }
      });
    });
}

const SentenceCompletion = textGap("sentence_completion", withOneGap);
const NoteTableCompletion = textGap("note_table_completion", withOneGap);
const ShortAnswer = textGap("short_answer", promptText);

/** Summary and flow-chart completion: typed from the passage, or chosen from a word bank. */
function gapOrWordBank<T extends "summary_completion" | "flowchart_completion">(type: T) {
  const fromBank = z
    .object({
      q_type: z.literal(type),
      prompt: withOneGap,
      options: z.object({ word_bank: list(2, 15) }).strict(),
      answer: LabelAnswer,
    })
    .superRefine((q, ctx) => {
      if (!q.options.word_bank.some((_, i) => letterLabel(i) === q.answer.label)) {
        ctx.addIssue({ code: "custom", path: ["answer", "label"], message: "The answer must be one of the words (A, B, …)" });
      }
    });
  return z.union([textGap(type, withOneGap), fromBank]);
}

const SummaryCompletion = gapOrWordBank("summary_completion");
const FlowchartCompletion = gapOrWordBank("flowchart_completion");

/** One question as stored (prompt, options, answer), validated for its type. */
export const ReadingQuestionContent = z.union([
  Mcq,
  Tfng,
  Ynng,
  MatchingHeadings,
  MatchingInformation,
  MatchingFeatures,
  SentenceCompletion,
  SummaryCompletion,
  NoteTableCompletion,
  FlowchartCompletion,
  ShortAnswer,
]);
export type ReadingQuestionContent = z.infer<typeof ReadingQuestionContent>;

/** Validate one stored question; reports the problems of its own type only. */
export function parseReadingQuestion(input: { q_type: string; prompt: unknown; options: unknown; answer: unknown }) {
  const schemas: Record<ReadingQuestionType, z.ZodType<ReadingQuestionContent>> = {
    mcq: Mcq,
    tfng: Tfng,
    ynng: Ynng,
    matching_headings: MatchingHeadings,
    matching_information: MatchingInformation,
    matching_features: MatchingFeatures,
    sentence_completion: SentenceCompletion,
    summary_completion: SummaryCompletion,
    note_table_completion: NoteTableCompletion,
    flowchart_completion: FlowchartCompletion,
    short_answer: ShortAnswer,
  };
  const type = ReadingQuestionTypeSchema.safeParse(input.q_type);
  if (!type.success) return type as unknown as z.ZodSafeParseResult<ReadingQuestionContent>;
  return schemas[type.data].safeParse(input);
}

/** What a student receives for one question (get-reading-test, M4-B1): never the answer. */
export const PublicReadingQuestion = z
  .object({
    id: z.uuid(),
    passage_id: z.uuid(),
    q_no: z.number().int().min(1).max(40),
    q_type: ReadingQuestionTypeSchema,
    prompt: z.string(),
    options: z.record(z.string(), z.unknown()),
  })
  .strict();
export type PublicReadingQuestion = z.infer<typeof PublicReadingQuestion>;

/** The labels a student can answer with for a question's options (empty for typed answers). */
export function answerLabels(q: { q_type: ReadingQuestionType; options: Record<string, unknown> }): string[] {
  const o = q.options;
  const n = (key: string) => (Array.isArray(o[key]) ? (o[key] as unknown[]).length : 0);
  switch (q.q_type) {
    case "mcq":
      return Array.from({ length: n("choices") }, (_, i) => letterLabel(i));
    case "tfng":
      return ["true", "false", "not_given"];
    case "ynng":
      return ["yes", "no", "not_given"];
    case "matching_headings":
      return Array.from({ length: n("headings") }, (_, i) => romanLabel(i));
    case "matching_information":
      return Array.isArray(o.paragraphs) ? (o.paragraphs as string[]) : [];
    case "matching_features":
      return Array.from({ length: n("features") }, (_, i) => letterLabel(i));
    case "summary_completion":
    case "flowchart_completion":
      return Array.from({ length: n("word_bank") }, (_, i) => letterLabel(i));
    default:
      return [];
  }
}

// ── Student responses ───────────────────────────────────────────────────────────────────────
/**
 * One answer as the player sends it: MCQ = the chosen letters; TFNG/YNNG = "true"/"yes"/…;
 * matching and word banks = a label; typed gaps = the text. Missing = unanswered.
 */
export const ReadingResponse = z.union([z.string().max(200), z.array(z.string().max(10)).max(3)]);
export type ReadingResponse = z.infer<typeof ReadingResponse>;

// ── Typed answers: the rules grade-test applies ─────────────────────────────────────────────
/**
 * Compare typed answers loosely, as an examiner would: case, surrounding spaces and
 * punctuation, curly quotes and repeated spaces don't matter. Spelling does.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s"'.,;:!?()]+|[\s"'.,;:!?()]+$/g, "");
}

/** Words in an answer; a hyphenated word counts as one (IELTS rule). */
export function countWords(value: string): { words: number; numbers: number } {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  const numbers = tokens.filter((t) => /^\d+([.,:/]\d+)*$/.test(t)).length;
  return { words: tokens.length - numbers, numbers };
}

/** Over the word limit = wrong, even if the right words are in it. */
export function withinWordLimit(value: string, limit: Pick<TextOptions, "max_words" | "number_allowed">): boolean {
  const { words, numbers } = countWords(value);
  if (limit.number_allowed) return words <= limit.max_words && numbers <= 1;
  return words + numbers <= limit.max_words;
}
