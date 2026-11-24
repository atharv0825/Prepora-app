// Listening answer sheet (M5-F2) and results (M5-F3) helpers. Pure, unit-tested (answers.test.ts).
import type { ListeningGradeResponse, ListeningQuestionResult, PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import { isLabelling, labellingImage, LISTENING_SECTIONS, sectionOfQuestion } from "@prepora/shared/ielts/listening";
import { withinWordLimit } from "@prepora/shared/ielts/reading";

/** By question number ("1".."40"): a label, typed text, or MCQ letters. */
export type Answers = Record<string, string | string[]>;

export function isAnswered(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;
  return Array.isArray(value) ? value.length > 0 : value.trim() !== "";
}

/** A copy with one answer set; an empty answer removes the question. */
export function setAnswer(answers: Answers, qNo: number, value: string | string[]): Answers {
  const next = { ...answers };
  if (isAnswered(value)) next[String(qNo)] = value;
  else delete next[String(qNo)];
  return next;
}

/** What is sent for grading: trimmed text, empty answers left out. */
export function toGradeAnswers(answers: Answers): Answers {
  const out: Answers = {};
  for (const [k, v] of Object.entries(answers)) {
    const clean = Array.isArray(v) ? v.map((s) => s.trim()).filter(Boolean) : v.trim();
    if (isAnswered(clean)) out[k] = clean;
  }
  return out;
}

export function answeredCount(answers: Answers, qNos: readonly number[]): number {
  return qNos.filter((n) => isAnswered(answers[String(n)])).length;
}

/** Questions by section (1–4), each sorted by number. */
export function questionsBySection(questions: readonly PublicListeningQuestion[]): Map<number, PublicListeningQuestion[]> {
  const map = new Map<number, PublicListeningQuestion[]>();
  for (let s = 1; s <= LISTENING_SECTIONS; s++) map.set(s, []);
  for (const q of [...questions].sort((a, b) => a.q_no - b.q_no)) map.get(sectionOfQuestion(q.q_no))!.push(q);
  return map;
}

export type SheetBlock =
  | { kind: "question"; question: PublicListeningQuestion }
  | { kind: "labelling"; image: { url: string; alt: string }; questions: PublicListeningQuestion[] };

/**
 * How a section's questions are laid out: consecutive labelling questions on the same image
 * become one block (the picture once, all its markers, the questions beside it).
 */
export function sheetBlocks(questions: readonly PublicListeningQuestion[]): SheetBlock[] {
  const blocks: SheetBlock[] = [];
  for (const q of questions) {
    const img = isLabelling(q.q_type) ? labellingImage(q.options) : null;
    const last = blocks.at(-1);
    if (img && last?.kind === "labelling" && last.image.url === img.url) last.questions.push(q);
    else if (img) blocks.push({ kind: "labelling", image: img, questions: [q] });
    else blocks.push({ kind: "question", question: q });
  }
  return blocks;
}

/** A typed answer that is already over its word limit: warn before submitting (it would be marked wrong). */
export function overWordLimit(q: Pick<PublicListeningQuestion, "options">, value: string | string[] | undefined): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  const max = q.options.max_words;
  if (typeof max !== "number") return false;
  return !withinWordLimit(value, { max_words: max, number_allowed: q.options.number_allowed === true });
}

/** Does this question take typed text (as opposed to a letter/label)? */
export function isTyped(q: Pick<PublicListeningQuestion, "q_type" | "options">): boolean {
  switch (q.q_type) {
    case "sentence_completion":
    case "note_table_completion":
    case "short_answer":
      return true;
    case "summary_completion":
    case "flowchart_completion":
    case "diagram_labelling":
      return !Array.isArray(q.options.word_bank);
    default:
      return false;
  }
}

// ── Saving in progress (so a reload doesn't lose answers) ─────────────────────────────────
export const draftKey = (testId: string, mode: string) => `prepora:listening:${testId}:${mode}`;

/** Read a saved draft; anything malformed is ignored. */
export function parseDraft(raw: string | null): Answers {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    const out: Answers = {};
    for (const [k, v] of Object.entries(value)) {
      if (!/^([1-9]|[1-3]\d|40)$/.test(k)) continue;
      if (typeof v === "string" && v.length <= 200) out[k] = v;
      else if (Array.isArray(v) && v.length <= 3 && v.every((x) => typeof x === "string" && x.length <= 10)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** What the results page shows: the grade-test response without the attempt id and allowance. */
export type ListeningResultsData = Pick<ListeningGradeResponse, "mode" | "raw_score" | "total" | "band" | "results" | "transcripts">;

// ── Results ────────────────────────────────────────────────────────────────────────────────
export function sectionScores(results: readonly Pick<ListeningQuestionResult, "q_no" | "correct">[]) {
  return Array.from({ length: LISTENING_SECTIONS }, (_, i) => {
    const inSection = results.filter((r) => sectionOfQuestion(r.q_no) === i + 1);
    return { section: i + 1, correct: inSection.filter((r) => r.correct).length, total: inSection.length };
  }).filter((s) => s.total > 0);
}

/** An answer as shown on the results page: "B", "A, C", "not given", "—" when unanswered. */
export function displayAnswer(value: string | string[] | null): string {
  if (value === null) return "—";
  const list = Array.isArray(value) ? value : [value];
  return list.length ? list.map((v) => v.replace(/_/g, " ")).join(", ") : "—";
}

const NUMBER_WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"];

/** The instruction above a typed answer: "ONE WORD AND/OR A NUMBER", "NO MORE THAN TWO WORDS". */
export function limitText(options: Record<string, unknown>): string | null {
  const max = options.max_words;
  if (typeof max !== "number" || max < 1) return null;
  const n = NUMBER_WORDS[max - 1] ?? String(max);
  const words = max === 1 ? "ONE WORD" : `NO MORE THAN ${n} WORDS`;
  return options.number_allowed === true ? `${words} AND/OR A NUMBER` : max === 1 ? "ONE WORD ONLY" : words;
}
