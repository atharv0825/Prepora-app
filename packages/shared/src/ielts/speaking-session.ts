// The Speaking session state machine (M8-C1). Pure, unit-tested; examiner-turn and score-speaking
// (M8-B1/B2) and the full-test screens (M8-F2) all use it.
//
// A session's stage is DERIVED from which parts already have a scored response (speaking_responses,
// one per part, M7-C1). There's no stage column to keep in sync:
//   full_test: part1 → part2 → part3 → finished
//   part1 | part2 | part3 (practice one part): that part → finished
// A part can be answered only at its stage, so a full test can't skip ahead or go back. Within
// Parts 1 and 3, the examiner asks QUESTIONS_PER_PART questions, one turn at a time.
import { overallBand } from "./bands";

export type SessionMode = "part1" | "part2" | "part3" | "full_test";
export type SpeakingPartNo = 1 | 2 | 3;
export type SessionStage = "part1" | "part2" | "part3" | "finished";

/** The parts a session goes through, in order. */
export function partsOf(mode: SessionMode): SpeakingPartNo[] {
  return mode === "full_test" ? [1, 2, 3] : [Number(mode.slice(4)) as SpeakingPartNo];
}

/** Where a session is, from the parts already scored. */
export function sessionStage(mode: SessionMode, scored: Iterable<number>): SessionStage {
  const done = new Set(scored);
  const next = partsOf(mode).find((p) => !done.has(p));
  return next ? (`part${next}` as SessionStage) : "finished";
}

/** Can this part be answered (and scored) now? Only the session's current part. */
export function canAnswer(mode: SessionMode, scored: Iterable<number>, part: SpeakingPartNo): boolean {
  return sessionStage(mode, scored) === `part${part}`;
}

/** The stage after scoring `part` (which must be the current one). */
export function stageAfter(mode: SessionMode, scored: Iterable<number>, part: SpeakingPartNo): SessionStage {
  if (!canAnswer(mode, scored, part)) throw new Error(`Part ${part} can't be answered now (stage ${sessionStage(mode, scored)})`);
  return sessionStage(mode, [...scored, part]);
}

/**
 * The session's overall band once every part is scored: a single part's own band, or the
 * IELTS-rounded average of Parts 1–3 (M8-C2). Null until finished.
 */
export function sessionOverallBand(mode: SessionMode, bands: Partial<Record<SpeakingPartNo, number>>): number | null {
  const parts = partsOf(mode);
  if (parts.some((p) => bands[p] === undefined)) return null;
  return overallBand(parts.map((p) => bands[p]!));
}

// ── Examiner turns (Parts 1 and 3) ──────────────────────────────────────────────────────────
/** How many questions the examiner asks: Part 1 4–5 short questions, Part 3 4–5 follow-ups. */
export const QUESTIONS_PER_PART: Record<1 | 3, { min: number; max: number }> = {
  1: { min: 4, max: 5 },
  3: { min: 4, max: 5 },
};

/** Is the examiner finished after `asked` questions? At the maximum always; never before the minimum. */
export function examinerDone(part: 1 | 3, asked: number, examinerWantsToStop: boolean): boolean {
  const { min, max } = QUESTIONS_PER_PART[part];
  if (asked >= max) return true;
  if (asked < min) return false;
  return examinerWantsToStop;
}
