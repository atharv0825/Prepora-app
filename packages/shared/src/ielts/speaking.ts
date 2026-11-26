// IELTS Speaking rules shared by the recorder, the feedback screen and score-speaking (M7-C2).
// Pure, no imports beyond types, so the Edge Functions can keep a copy in sync by test.
//
// Each part is scored on four criteria, in whole or half bands (0–9):
//   fc   Fluency and Coherence
//   lr   Lexical Resource
//   gra  Grammatical Range and Accuracy
//   pron Pronunciation (judged on intelligibility, never on accent: plan §5.1)
// A part's band is the average of the four, rounded DOWN to a half band, as for a Writing task.
// The session's overall band (M8-C2) is the average of Parts 1–3 rounded the IELTS way.
import type { ActionKey } from "../api/credits";

export const speakingCriteria = ["fc", "lr", "gra", "pron"] as const;
export type SpeakingCriterion = (typeof speakingCriteria)[number];
export type SpeakingScores = Record<SpeakingCriterion, number>;
export type SpeakingPart = 1 | 2 | 3;

export const SPEAKING_PARTS: Record<
  SpeakingPart,
  { actionKey: Extract<ActionKey, "speaking_p1" | "speaking_p2" | "speaking_p3">; prepSeconds: number; maxSeconds: number }
> = {
  // Part 1: 4–5 short answers (each up to ~45 s; the examiner moves on).
  1: { actionKey: "speaking_p1", prepSeconds: 0, maxSeconds: 45 },
  // Part 2: 1 minute to prepare, then speak for up to 2 minutes (the recorder stops at 2:00).
  2: { actionKey: "speaking_p2", prepSeconds: 60, maxSeconds: 120 },
  // Part 3: 4–5 longer discussion answers (each up to ~90 s).
  3: { actionKey: "speaking_p3", prepSeconds: 0, maxSeconds: 90 },
};

/** A Part 2 answer under a minute is short (the card asks for 1–2 minutes). */
export const PART2_MIN_SECONDS = 60;

export function speakingCriterionLabel(c: SpeakingCriterion): string {
  switch (c) {
    case "fc":
      return "Fluency and Coherence";
    case "lr":
      return "Lexical Resource";
    case "gra":
      return "Grammatical Range and Accuracy";
    case "pron":
      return "Pronunciation";
  }
}

function isHalfBand(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

/** A part's band: the average of the four criteria, rounded down to a half band. */
export function speakingPartBand(scores: SpeakingScores): number {
  for (const c of speakingCriteria) {
    if (!isHalfBand(scores[c])) throw new RangeError(`${c} must be a band from 0 to 9 in steps of 0.5`);
  }
  const average = (scores.fc + scores.lr + scores.gra + scores.pron) / 4;
  return Math.floor(average * 2 + 1e-9) / 2;
}

// ── Fillers ─────────────────────────────────────────────────────────────────────────────────
/**
 * Hesitation fillers counted in a transcript. Only words that are fillers whatever the context:
 * "like", "so", "actually" are often real words, so they're left to the AI's judgement.
 */
export const FILLERS = ["um", "umm", "uh", "uhm", "er", "erm", "ah", "hmm", "you know", "i mean"] as const;

export type FillerCount = { word: string; count: number };

/** How often each filler occurs (case-insensitive, whole words), most frequent first. */
export function countFillers(transcript: string): FillerCount[] {
  const text = transcript.toLowerCase();
  const out: FillerCount[] = [];
  for (const f of FILLERS) {
    const re = new RegExp(`(?<![\\p{L}'])${f.replace(" ", "\\s+")}(?![\\p{L}'])`, "gu");
    const count = text.match(re)?.length ?? 0;
    if (count) out.push({ word: f, count });
  }
  return out.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

/** Words spoken (fillers included: they take time), as for speaking rate. */
export function countSpokenWords(transcript: string): number {
  return transcript.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

/** Words per minute, rounded; null without a duration. */
export function wordsPerMinute(words: number, durationSec: number | null | undefined): number | null {
  if (!durationSec || durationSec <= 0) return null;
  return Math.round((words / durationSec) * 60);
}
