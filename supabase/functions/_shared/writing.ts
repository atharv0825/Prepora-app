// Writing rules for score-writing and ocr-writing (M6-B3/B4). Pure TypeScript with NO imports, so
// the same file runs in the Edge Functions (Deno) and in vitest (tests/writing-scoring.test.ts),
// which checks it agrees with the shared contract in packages/shared:
//   * WRITING_TASKS, writingTaskBand, countEssayWords, isUnderLength ↔ ielts/writing.ts
//   * toWritingSummary / writingFeedbackFor                         ↔ api/score-writing.ts
//   * joinOcrPages                                                   ↔ api/ocr-writing.ts

export type WritingTaskNo = 1 | 2;
export type WritingScores = { ta: number; cc: number; lr: number; gra: number };
export type WritingCorrection = { original: string; suggestion: string; category: string; explanation: string };
export type ScoredWriting = {
  scores: WritingScores;
  summary: string;
  corrections: WritingCorrection[];
  strengths: string[];
  improvements: string[];
  model_answer: string;
};
export type WritingFeedback =
  | { detail: "full"; summary: string; corrections: WritingCorrection[]; strengths: string[]; improvements: string[]; model_answer: string }
  | { detail: "summary"; summary: string; corrections_count: number };

export const WRITING_TASKS: Record<WritingTaskNo, { minWords: number; minutes: number; actionKey: "writing_t1" | "writing_t2" }> = {
  1: { minWords: 150, minutes: 20, actionKey: "writing_t1" },
  2: { minWords: 250, minutes: 40, actionKey: "writing_t2" },
};

export function isHalfBand(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

/** The task band: the average of the four criteria, rounded down to a half band. */
export function writingTaskBand(scores: WritingScores): number {
  for (const c of ["ta", "cc", "lr", "gra"] as const) {
    if (!isHalfBand(scores[c])) throw new RangeError(`${c} must be a band from 0 to 9 in steps of 0.5`);
  }
  const average = (scores.ta + scores.cc + scores.lr + scores.gra) / 4;
  return Math.floor(average * 2 + 1e-9) / 2;
}

/** Runs of non-space characters with at least one letter or digit. */
export function countEssayWords(text: string): number {
  let n = 0;
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) n++;
  }
  return n;
}

export function isUnderLength(wordCount: number, taskNo: WritingTaskNo): boolean {
  return wordCount < WRITING_TASKS[taskNo].minWords;
}

/**
 * Corrections the screen can highlight: `original` must occur in the answer exactly. The model is
 * asked to quote; anything it paraphrased (or invented) is dropped, as are duplicates and
 * corrections that change nothing.
 */
export function keepFoundCorrections(text: string, corrections: WritingCorrection[]): WritingCorrection[] {
  const seen = new Set<string>();
  return corrections.filter((c) => {
    const key = `${c.original}\u0000${c.suggestion}`;
    if (!c.original.trim() || c.original === c.suggestion || seen.has(key) || !text.includes(c.original)) return false;
    seen.add(key);
    return true;
  });
}

export function toWritingSummary(scored: Pick<ScoredWriting, "summary" | "corrections">): Extract<WritingFeedback, { detail: "summary" }> {
  return { detail: "summary", summary: scored.summary, corrections_count: scored.corrections.length };
}

/** Full feedback with the plan's detailed_feedback flag, else the Free summary. */
export function writingFeedbackFor(scored: ScoredWriting, detailedFeedback: boolean): WritingFeedback {
  if (!detailedFeedback) return toWritingSummary(scored);
  return {
    detail: "full",
    summary: scored.summary,
    corrections: scored.corrections,
    strengths: scored.strengths,
    improvements: scored.improvements,
    model_answer: scored.model_answer,
  };
}

/** The editor text from OCR pages: each page trimmed, non-empty pages joined with a blank line. */
export function joinOcrPages(pages: readonly { text: string }[]): string {
  return pages
    .map((p) => p.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** writing-photos paths are {user_id}/{file}: true when the folder is this user's. */
export function isOwnPhotoPath(userId: string, path: string): boolean {
  const [folder, file, ...rest] = path.split("/");
  return folder === userId && Boolean(file) && rest.length === 0 && file !== "." && file !== "..";
}
