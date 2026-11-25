// Admin Reading builder contract (M4-A1).
//
//   admin_get_reading_test(id) → AdminReadingTest: the whole test with answer keys (staff only)
//   admin_order_reading_questions(id, ids[]) → renumbers questions 1..N in that order
//   reading_tests / reading_passages / reading_questions: plain writes (staff RLS, M4-C1)
//
// The inputs below are what the builder's Server Functions accept; each question is checked
// against its type's contract (ielts/reading.ts) before it's saved, so a saved key always grades.
import { z } from "zod";
import { PlanTier } from "./credits";
import { PASSAGE_MAX, sanitizePassage } from "../ielts/passage-text";
import { parseReadingQuestion, ReadingQuestionTypeSchema, readingQuestionTypeLabels } from "../ielts/reading";

export const ContentStatus = z.enum(["draft", "review", "published", "archived"]);
export type ContentStatus = z.infer<typeof ContentStatus>;
export const ReadingTestType = z.enum(["academic", "general"]);

export const contentStatusLabels: Record<ContentStatus, string> = {
  draft: "Draft",
  review: "In review",
  published: "Published",
  archived: "Archived",
};

export const MAX_QUESTIONS = 40;

/** A test, passage or question id. */
export const ContentId = z.uuid();

// ── What the builder loads ──────────────────────────────────────────────────────────────────
export const AdminReadingQuestion = z.object({
  id: z.uuid(),
  passage_id: z.uuid(),
  q_no: z.number().int().min(1).max(MAX_QUESTIONS),
  q_type: ReadingQuestionTypeSchema,
  prompt: z.string(),
  options: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
  explanation: z.string().nullable(),
});
export type AdminReadingQuestion = z.infer<typeof AdminReadingQuestion>;

export const AdminReadingPassage = z.object({
  id: z.uuid(),
  order_no: z.number().int().min(1).max(3),
  title: z.string(),
  body: z.string(),
  updated_at: z.string(),
});
export type AdminReadingPassage = z.infer<typeof AdminReadingPassage>;

export const AdminReadingTest = z.object({
  test: z.object({
    id: z.uuid(),
    test_type: ReadingTestType,
    title: z.string(),
    source: z.enum(["admin", "ai"]),
    status: ContentStatus,
    min_plan: PlanTier,
    published_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  passages: z.array(AdminReadingPassage).max(3),
  questions: z.array(AdminReadingQuestion).max(MAX_QUESTIONS),
});
export type AdminReadingTest = z.infer<typeof AdminReadingTest>;

// ── What the builder saves ──────────────────────────────────────────────────────────────────
const title = z.string().trim().min(1, "Enter a title").max(200, "200 characters at most");

export const ReadingTestDetails = z.object({
  title,
  test_type: ReadingTestType,
  min_plan: PlanTier,
});
export type ReadingTestDetails = z.infer<typeof ReadingTestDetails>;

export const ReadingPassageInput = z.object({
  test_id: z.uuid(),
  order_no: z.coerce.number().int().min(1).max(3),
  title,
  body: z
    .string()
    .transform(sanitizePassage)
    .pipe(z.string().min(1, "Write the passage").max(PASSAGE_MAX, `${PASSAGE_MAX.toLocaleString("en")} characters at most`)),
});
export type ReadingPassageInput = z.infer<typeof ReadingPassageInput>;

/** One question as the builder sends it; content is validated per type. */
export const ReadingQuestionInput = z
  .object({
    test_id: z.uuid(),
    passage_id: z.uuid(),
    /** Absent for a new question. */
    id: z.uuid().optional(),
    q_type: ReadingQuestionTypeSchema,
    prompt: z.string(),
    options: z.record(z.string(), z.unknown()),
    answer: z.unknown(),
    explanation: z
      .string()
      .trim()
      .max(4000, "4,000 characters at most")
      .transform((s) => (s === "" ? null : s))
      .nullable(),
  })
  .transform((input, ctx) => {
    const content = parseReadingQuestion(input);
    if (!content.success) {
      for (const issue of content.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      return z.NEVER;
    }
    // The parsed content: trimmed, with defaults filled in (e.g. MCQ select: 1).
    return { ...input, ...content.data };
  });
export type ReadingQuestionInput = z.output<typeof ReadingQuestionInput>;

// ── Numbering ───────────────────────────────────────────────────────────────────────────────
type Numbered = { id: string; passage_id: string; q_no: number };

/**
 * Question ids in test order: by passage (1, 2, 3), then by current number. Questions are always
 * numbered in this order, so adding one to passage 1 pushes passage 2's questions up by one.
 */
export function questionOrder(questions: readonly Numbered[], passages: readonly { id: string; order_no: number }[]): string[] {
  const rank = new Map(passages.map((p) => [p.id, p.order_no]));
  return [...questions]
    .sort((a, b) => (rank.get(a.passage_id) ?? 9) - (rank.get(b.passage_id) ?? 9) || a.q_no - b.q_no)
    .map((q) => q.id);
}

/** The order with one question moved up or down within its passage; null if it can't move. */
export function moveQuestion(
  questions: readonly Numbered[],
  passages: readonly { id: string; order_no: number }[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const order = questionOrder(questions, passages);
  const passageOf = new Map(questions.map((q) => [q.id, q.passage_id]));
  const i = order.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length || passageOf.get(order[j]!) !== passageOf.get(id)) return null;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return order;
}

// ── Publishing ──────────────────────────────────────────────────────────────────────────────
export type PublishCheck = {
  /** Must be fixed before publishing. */
  blocking: string[];
  /** Worth a look, but publishing is allowed. */
  warnings: string[];
};

/**
 * What stops a test from being published. The database checks the first two again (3 passages,
 * questions 1..N); the rest it can't: each question's content against its type, number order.
 */
export function publishCheck(t: Pick<AdminReadingTest, "passages" | "questions">): PublishCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const passages = [...t.passages].sort((a, b) => a.order_no - b.order_no);
  const questions = [...t.questions].sort((a, b) => a.q_no - b.q_no);

  if (passages.length !== 3) blocking.push(`Add all 3 passages (${passages.length} so far).`);
  if (questions.length === 0) blocking.push("Add questions.");
  else if (questions.some((q, i) => q.q_no !== i + 1)) blocking.push("Question numbers have a gap. Reorder the questions to fix it.");

  const order = questionOrder(questions, passages);
  if (order.some((id, i) => questions[i]?.id !== id)) blocking.push("Questions aren't numbered in passage order. Reorder them.");

  for (const q of questions) {
    const parsed = parseReadingQuestion(q);
    if (!parsed.success) {
      blocking.push(`Question ${q.q_no} (${readingQuestionTypeLabels[q.q_type]}): ${parsed.error.issues[0]?.message ?? "invalid"}.`);
    }
  }

  for (const p of passages) {
    if (!questions.some((q) => q.passage_id === p.id)) warnings.push(`Passage ${p.order_no} has no questions.`);
  }
  const unexplained = questions.filter((q) => !q.explanation?.trim()).map((q) => q.q_no);
  if (unexplained.length) {
    warnings.push(`No explanation for question${unexplained.length > 1 ? "s" : ""} ${unexplained.join(", ")}. Students see one with their results.`);
  }
  if (questions.length > 0 && questions.length < MAX_QUESTIONS) {
    warnings.push(`${questions.length} of ${MAX_QUESTIONS} questions: the band is scaled up from a shorter test.`);
  }
  return { blocking, warnings };
}
