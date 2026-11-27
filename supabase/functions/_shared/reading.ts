// Reading and Listening grading (M4-B2, M5-B2): grades a student's answers against
// reading_questions / listening_questions and converts the raw score to a band. Pure TypeScript with NO imports, so the same file runs in the
// grade-test Edge Function (Deno) and in the unit tests (vitest, tests/reading-grading.test.ts).
//
// It copies the rules in packages/shared/src/ielts (Edge Functions can't import packages/shared):
//   * band tables and scaling        ↔ ielts/bands.ts
//   * normalizeText, countWords, word limits, labels ↔ ielts/reading.ts
//   * the Listening band table       ↔ ielts/listening.ts
// tests/reading-grading.test.ts and tests/listening-grading.test.ts check the copies agree.
//
// Marking rules, per type:
//   * MCQ: the chosen letters must be exactly the answer's letters (order doesn't matter).
//     "Choose TWO" is one question worth one mark here, all or nothing.
//   * TFNG / YNNG: the value must match; "not given" is accepted for not_given. Writing "yes" for
//     a True/False question is wrong, as in the real test.
//   * Matching and word banks: the label must match (case doesn't matter).
//   * Typed gaps: over the word limit is wrong even if the right words are in it; otherwise the
//     normalised text must equal one of the accepted answers. Spelling counts.
//   * Map labelling (Listening): the place's letter must match, like matching.
//   * Diagram labelling (Listening): typed with a word limit like a gap, or a word-bank letter.
//   * No answer (missing, "" or []) is wrong and noted as unanswered.

// ── Bands (copy of ielts/bands.ts) ──────────────────────────────────────────────────────────
export type TestType = "academic" | "general";

export const READING_BANDS: Record<TestType, readonly (readonly [number, number])[]> = {
  academic: [
    [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5],
    [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0],
  ],
  general: [
    [40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5],
    [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [3, 2], [1, 1], [0, 0],
  ],
};

export const FULL_TEST_QUESTIONS = 40;

export function scaledRawScore(raw: number, total: number): number {
  if (!Number.isInteger(raw) || !Number.isInteger(total) || total < 1 || raw < 0 || raw > total) {
    throw new RangeError(`invalid score ${raw}/${total}`);
  }
  return total === FULL_TEST_QUESTIONS ? raw : Math.floor((raw * FULL_TEST_QUESTIONS) / total);
}

export function readingBand(testType: TestType, raw: number, total: number = FULL_TEST_QUESTIONS): number {
  const scaled = scaledRawScore(raw, total);
  const row = READING_BANDS[testType].find(([min]) => scaled >= min);
  return row ? row[1] : 0;
}

/** Listening: one table for Academic and General Training (copy of ielts/listening.ts). */
export const LISTENING_BANDS: readonly (readonly [number, number])[] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5],
  [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0],
];

export function listeningBand(raw: number, total: number = FULL_TEST_QUESTIONS): number {
  const scaled = scaledRawScore(raw, total);
  const row = LISTENING_BANDS.find(([min]) => scaled >= min);
  return row ? row[1] : 0;
}

// ── Typed answers (copy of ielts/reading.ts) ────────────────────────────────────────────────
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

export function countWords(value: string): { words: number; numbers: number } {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  const numbers = tokens.filter((t) => /^\d+([.,:/]\d+)*$/.test(t)).length;
  return { words: tokens.length - numbers, numbers };
}

export function withinWordLimit(value: string, limit: { max_words: number; number_allowed?: boolean }): boolean {
  const { words, numbers } = countWords(value);
  if (limit.number_allowed) return words <= limit.max_words && numbers <= 1;
  return words + numbers <= limit.max_words;
}

// ── Grading ─────────────────────────────────────────────────────────────────────────────────
export type QuestionType =
  | "mcq"
  | "tfng"
  | "ynng"
  | "matching_headings"
  | "matching_information"
  | "matching_features"
  | "sentence_completion"
  | "summary_completion"
  | "note_table_completion"
  | "flowchart_completion"
  | "short_answer"
  // Listening only (M5-B2).
  | "map_labelling"
  | "diagram_labelling";

/** A question with its key, as grade-test loads it (service role). */
export interface GradableQuestion {
  q_no: number;
  q_type: QuestionType;
  options: Record<string, unknown>;
  answer: unknown;
  explanation: string | null;
}

export type Given = string | string[] | null;

/** One result: the shape of QuestionResult in packages/shared/src/api/grade-test.ts. */
export interface QuestionResult {
  q_no: number;
  q_type: QuestionType;
  correct: boolean;
  given: Given;
  correct_answer: string | string[];
  also_accepted: string[];
  note: "over_word_limit" | "unanswered" | null;
  explanation: string | null;
}

export interface GradedTest {
  raw_score: number;
  total: number;
  band: number;
  results: QuestionResult[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** "" / [] / anything else unusable → null (unanswered). */
function cleanGiven(given: unknown): Given {
  if (typeof given === "string") return given.trim() === "" ? null : given;
  if (Array.isArray(given)) {
    const list = strings(given).map((s) => s.trim()).filter(Boolean);
    return list.length ? list : null;
  }
  return null;
}

const asList = (given: Given): string[] => (given === null ? [] : Array.isArray(given) ? given : [given]);
const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function choiceValue(value: string): string {
  const v = normalizeText(value).replace(/\s+/g, "_");
  return v === "notgiven" || v === "ng" ? "not_given" : v;
}

/** Grade one question. A malformed key (shouldn't happen: the builder validates) is never "correct". */
export function gradeQuestion(q: GradableQuestion, rawGiven: unknown): QuestionResult {
  const given = cleanGiven(rawGiven);
  const key = isObject(q.answer) ? q.answer : {};
  const base = { q_no: q.q_no, q_type: q.q_type, given, explanation: q.explanation, also_accepted: [] as string[] };

  const result = (correct: boolean, correct_answer: string | string[], extra: Partial<QuestionResult> = {}): QuestionResult => ({
    ...base,
    correct: given !== null && correct,
    correct_answer,
    note: given === null ? "unanswered" : null,
    ...extra,
  });

  switch (q.q_type) {
    case "mcq": {
      const labels = strings(key.labels);
      const chosen = asList(given).map((s) => s.trim().toUpperCase());
      const correct =
        labels.length > 0 &&
        chosen.length === labels.length &&
        new Set(chosen).size === chosen.length &&
        labels.every((l) => chosen.includes(l.toUpperCase()));
      return result(correct, labels);
    }
    case "tfng":
    case "ynng": {
      const value = typeof key.value === "string" ? key.value : "";
      const correct = value !== "" && typeof given === "string" && choiceValue(given) === value;
      return result(correct, value);
    }
    case "matching_headings":
    case "matching_information":
    case "matching_features":
    case "map_labelling": {
      const label = typeof key.label === "string" ? key.label : "";
      return result(label !== "" && typeof given === "string" && sameLabel(given, label), label);
    }
    case "summary_completion":
    case "flowchart_completion":
    case "diagram_labelling":
      // Word-bank variant: answered with a letter.
      if (typeof key.label === "string") {
        const label = key.label;
        return result(typeof given === "string" && sameLabel(given, label), label);
      }
    // falls through: typed gap
    case "sentence_completion":
    case "note_table_completion":
    case "short_answer": {
      const accept = strings(key.accept);
      const shown = accept[0] ?? "";
      const extra = { also_accepted: accept.slice(1) };
      if (typeof given !== "string") return result(false, shown, extra);
      const maxWords = typeof q.options.max_words === "number" ? q.options.max_words : 5;
      if (!withinWordLimit(given, { max_words: maxWords, number_allowed: q.options.number_allowed === true })) {
        return { ...result(false, shown, extra), note: "over_word_limit" };
      }
      const typed = normalizeText(given);
      return result(accept.some((a) => normalizeText(a) === typed), shown, extra);
    }
  }
}

/** Grade a whole test. answers are keyed by question number ("1".."40"). */
export function gradeTest(testType: TestType, questions: readonly GradableQuestion[], answers: Record<string, unknown>): GradedTest {
  if (questions.length === 0) throw new RangeError("a test without questions can't be graded");
  const results = [...questions].sort((a, b) => a.q_no - b.q_no).map((q) => gradeQuestion(q, answers[String(q.q_no)]));
  const raw_score = results.filter((r) => r.correct).length;
  return { raw_score, total: results.length, band: readingBand(testType, raw_score, results.length), results };
}

/** Grade a whole Listening test (any of the 13 types); the band uses the Listening table. */
export function gradeListeningTest(questions: readonly GradableQuestion[], answers: Record<string, unknown>): GradedTest {
  if (questions.length === 0) throw new RangeError("a test without questions can't be graded");
  const results = [...questions].sort((a, b) => a.q_no - b.q_no).map((q) => gradeQuestion(q, answers[String(q.q_no)]));
  const raw_score = results.filter((r) => r.correct).length;
  return { raw_score, total: results.length, band: listeningBand(raw_score, results.length), results };
}
