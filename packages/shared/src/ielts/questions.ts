// Answering questions, shared by the Reading (M4-F3) and Listening (M5-F2) players: answers,
// drafts, word limits, and how questions are grouped under IELTS-style instructions.
// Pure, unit-tested (questions.test.ts). In packages/shared so the admin builder's preview (M4-A1)
// renders questions exactly as students see them.
import type { ListeningQuestionType } from "./listening";
import { withinWordLimit } from "./reading";

/** A question as a player shows it (never with its answer). Reading types are a subset of Listening's. */
export type PlayerQuestion = { q_no: number; q_type: ListeningQuestionType; prompt: string; options: Record<string, unknown> };

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

/** A typed answer that is already over its word limit: warn before submitting (it would be marked wrong). */
export function overWordLimit(q: Pick<PlayerQuestion, "options">, value: string | string[] | undefined): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  const max = q.options.max_words;
  if (typeof max !== "number") return false;
  return !withinWordLimit(value, { max_words: max, number_allowed: q.options.number_allowed === true });
}

/** Does this question take typed text (as opposed to a letter/label)? */
export function isTyped(q: Pick<PlayerQuestion, "q_type" | "options">): boolean {
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

// ── Question groups ─────────────────────────────────────────────────────────────────────────
const LIST_KEYS = ["headings", "features", "word_bank", "paragraphs"] as const;

/** The shared list a group answers from (headings, features, a word bank), if any. */
export function sharedList(q: Pick<PlayerQuestion, "options">): { key: (typeof LIST_KEYS)[number]; items: string[] } | null {
  for (const key of LIST_KEYS) {
    const v = q.options[key];
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return { key, items: v as string[] };
  }
  return null;
}

export type QuestionGroup<Q extends PlayerQuestion = PlayerQuestion> = { first: number; last: number; questions: Q[] };

/**
 * Consecutive questions of the same type (and, for matching and word banks, the same list) form
 * one group under one instruction, as on the test paper: "Questions 1–5 …".
 */
export function questionGroups<Q extends PlayerQuestion>(questions: readonly Q[]): QuestionGroup<Q>[] {
  const groups: QuestionGroup<Q>[] = [];
  const sameList = (a: Q, b: Q) => JSON.stringify(sharedList(a)) === JSON.stringify(sharedList(b));
  for (const q of [...questions].sort((a, b) => a.q_no - b.q_no)) {
    const g = groups.at(-1);
    const prev = g?.questions.at(-1);
    if (g && prev && prev.q_type === q.q_type && prev.q_no === q.q_no - 1 && sameList(prev, q)) {
      g.questions.push(q);
      g.last = q.q_no;
    } else groups.push({ first: q.q_no, last: q.q_no, questions: [q] });
  }
  return groups;
}

/** The instruction above a group, worded as on the IELTS paper. */
export function groupInstruction(group: QuestionGroup): string {
  const q = group.questions[0]!;
  const limit = limitText(q.options);
  const write = (what: string) => `Write ${what} for each answer.`;
  switch (q.q_type) {
    case "mcq":
      return typeof q.options.select === "number" && q.options.select > 1
        ? `Choose ${["", "ONE", "TWO", "THREE"][q.options.select] ?? q.options.select} letters.`
        : "Choose the correct letter.";
    case "tfng":
      return "Do the statements agree with the information in the passage? Choose TRUE, FALSE or NOT GIVEN.";
    case "ynng":
      return "Do the statements agree with the views of the writer? Choose YES, NO or NOT GIVEN.";
    case "matching_headings":
      return "Choose the correct heading for each paragraph from the list of headings.";
    case "matching_information":
      return `Which paragraph contains the following information? ${q.options.reuse === false ? "" : "You may use any letter more than once."}`.trim();
    case "matching_features":
      return `Match each statement with the correct option. ${q.options.reuse === false ? "" : "You may use any letter more than once."}`.trim();
    case "summary_completion":
    case "flowchart_completion":
    case "diagram_labelling":
      return sharedList(q) ? "Complete it using the list of words. Choose the correct letter." : `Complete it. ${write(limit ?? "your answer")}`;
    case "map_labelling":
      return "Label the map. Choose the correct letter.";
    case "short_answer":
      return `Answer the questions. ${write(limit ?? "your answer")}`;
    default:
      return `Complete it. ${write(limit ?? "your answer")}`;
  }
}

export const questionRange = (g: Pick<QuestionGroup, "first" | "last">) => (g.first === g.last ? `Question ${g.first}` : `Questions ${g.first}–${g.last}`);
