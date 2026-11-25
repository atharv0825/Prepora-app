// Listening answer sheet (M5-F2) and results (M5-F3) helpers. Pure, unit-tested (answers.test.ts).
import type { ListeningGradeResponse, ListeningQuestionResult, PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import { isLabelling, labellingImage, LISTENING_SECTIONS, sectionOfQuestion } from "@prepora/shared/ielts/listening";

// The answer helpers shared with the Reading player live in @prepora/shared/ielts/questions.
export {
  type Answers,
  answeredCount,
  displayAnswer,
  isAnswered,
  isTyped,
  limitText,
  overWordLimit,
  parseDraft,
  setAnswer,
  toGradeAnswers,
} from "@prepora/shared/ielts/questions";

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

// ── Saving in progress (so a reload doesn't lose answers) ─────────────────────────────────
export const draftKey = (testId: string, mode: string) => `prepora:listening:${testId}:${mode}`;

/** What the results page shows: the grade-test response without the attempt id and allowance. */
export type ListeningResultsData = Pick<ListeningGradeResponse, "mode" | "raw_score" | "total" | "band" | "results" | "transcripts">;

// ── Results ────────────────────────────────────────────────────────────────────────────────
export function sectionScores(results: readonly Pick<ListeningQuestionResult, "q_no" | "correct">[]) {
  return Array.from({ length: LISTENING_SECTIONS }, (_, i) => {
    const inSection = results.filter((r) => sectionOfQuestion(r.q_no) === i + 1);
    return { section: i + 1, correct: inSection.filter((r) => r.correct).length, total: inSection.length };
  }).filter((s) => s.total > 0);
}

