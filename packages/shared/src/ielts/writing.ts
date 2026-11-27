// IELTS Writing rules shared by the editor, the feedback screen and score-writing (M6-C2).
// Pure, no imports beyond types, so score-writing (M6-B3) can keep a copy in sync by test.
//
// Each task is scored on four criteria, in whole or half bands (0–9):
//   ta  Task Achievement (Task 1) / Task Response (Task 2)
//   cc  Coherence and Cohesion
//   lr  Lexical Resource
//   gra Grammatical Range and Accuracy
// The task band is the average of the four, rounded DOWN to a half band (6.75 → 6.5, 6.25 → 6).
// That is how examiners combine criteria for a task; it's a practice estimate here, as for the
// Reading band.
import type { ActionKey } from "../api/credits";

export const writingCriteria = ["ta", "cc", "lr", "gra"] as const;
export type WritingCriterion = (typeof writingCriteria)[number];
export type WritingScores = Record<WritingCriterion, number>;

export type WritingTaskNo = 1 | 2;

export const WRITING_TASKS: Record<
  WritingTaskNo,
  { minWords: number; minutes: number; actionKey: Extract<ActionKey, "writing_t1" | "writing_t2"> }
> = {
  1: { minWords: 150, minutes: 20, actionKey: "writing_t1" },
  2: { minWords: 250, minutes: 40, actionKey: "writing_t2" },
};

/** Criterion names as the feedback screen shows them (ta differs by task). */
export function criterionLabel(criterion: WritingCriterion, taskNo: WritingTaskNo): string {
  switch (criterion) {
    case "ta":
      return taskNo === 1 ? "Task Achievement" : "Task Response";
    case "cc":
      return "Coherence and Cohesion";
    case "lr":
      return "Lexical Resource";
    case "gra":
      return "Grammatical Range and Accuracy";
  }
}

/** A band is 0–9 in steps of 0.5. */
export function isHalfBand(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

/** The task band: the average of the four criteria, rounded down to a half band. */
export function writingTaskBand(scores: WritingScores): number {
  for (const c of writingCriteria) {
    if (!isHalfBand(scores[c])) throw new RangeError(`${c} must be a band from 0 to 9 in steps of 0.5`);
  }
  const average = (scores.ta + scores.cc + scores.lr + scores.gra) / 4;
  // Averages of half bands are multiples of 0.125, so the epsilon only absorbs float error.
  return Math.floor(average * 2 + 1e-9) / 2;
}

/**
 * Words as the editor counts them live and score-writing stores them: runs of non-space
 * characters with at least one letter or digit. "well-known" is one word, "25%" is one, a lone
 * "-" or "…" is none. (The real test counts by hand; this is the usual approximation.)
 */
export function countEssayWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) n++;
  }
  return n;
}

/** Under the minimum length (150 / 250 words), which costs Task Achievement / Response. */
export function isUnderLength(wordCount: number, taskNo: WritingTaskNo): boolean {
  return wordCount < WRITING_TASKS[taskNo].minWords;
}
