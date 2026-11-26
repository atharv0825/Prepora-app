// Speaking rules and audio signals for score-speaking (M7-B2). Pure TypeScript with NO imports, so
// the same file runs in the Edge Function (Deno) and in vitest (tests/speaking-signals.test.ts),
// which checks the copied rules agree with packages/shared/src/ielts/speaking.ts:
//   speakingPartBand, FILLERS, countFillers, countSpokenWords, wordsPerMinute.
//
// The signals (speakingSignals) are measured from the transcript and Whisper's word timings
// (stt.ts, M7-B1) and given to the AI with the transcript (M7-B3):
//   * words_per_minute: over the speech itself (first word's start to last word's end), so
//     silence before the first word or after the last doesn't count; without timings, over the
//     whole recording.
//   * pauses: silences of PAUSE_SEC or more between consecutive words; longest_pause_sec.
//   * filler_count: hesitation fillers (um, uh, er, "you know"…), as the contract counts them.
//   * transcript_confidence: how sure the speech model was (0–1), the time-weighted mean of
//     exp(avg_logprob) over segments that hold speech. A low value suggests speech that was hard
//     to understand; the AI uses it for Pronunciation alongside the transcript, never accent.

export type SpeakingScores = { fc: number; lr: number; gra: number; pron: number };
export type FillerCount = { word: string; count: number };
export type TimedWord = { word: string; start: number; end: number };
export type TimedSegment = { start: number; end: number; avg_logprob: number | null; no_speech_prob: number | null };
export type SpeakingSignals = {
  duration_sec: number;
  words: number;
  words_per_minute: number | null;
  pauses: number | null;
  longest_pause_sec: number | null;
  filler_count: number;
  transcript_confidence: number | null;
};

/** A silence between words that counts as a pause. */
export const PAUSE_SEC = 1;

function isHalfBand(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 9 && Number.isInteger(value * 2);
}

/** A part's band: the average of the four criteria, rounded down to a half band. */
export function speakingPartBand(scores: SpeakingScores): number {
  for (const c of ["fc", "lr", "gra", "pron"] as const) {
    if (!isHalfBand(scores[c])) throw new RangeError(`${c} must be a band from 0 to 9 in steps of 0.5`);
  }
  const average = (scores.fc + scores.lr + scores.gra + scores.pron) / 4;
  return Math.floor(average * 2 + 1e-9) / 2;
}

export const FILLERS = ["um", "umm", "uh", "uhm", "er", "erm", "ah", "hmm", "you know", "i mean"] as const;

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

export function countSpokenWords(transcript: string): number {
  return transcript.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
}

export function wordsPerMinute(words: number, durationSec: number | null | undefined): number | null {
  if (!durationSec || durationSec <= 0) return null;
  return Math.round((words / durationSec) * 60);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Silences of PAUSE_SEC or more between consecutive words (timings sorted by start). */
export function pausesBetween(words: readonly TimedWord[]): { count: number; longest: number } {
  const sorted = [...words].sort((a, b) => a.start - b.start);
  let count = 0;
  let longest = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i]!.start - sorted[i - 1]!.end;
    if (gap >= PAUSE_SEC) {
      count++;
      longest = Math.max(longest, gap);
    }
  }
  return { count, longest: round1(longest) };
}

/** 0–1: the time-weighted mean of exp(avg_logprob) over segments with speech; null without any. */
export function transcriptConfidence(segments: readonly TimedSegment[]): number | null {
  let weighted = 0;
  let total = 0;
  for (const s of segments) {
    if (s.avg_logprob === null || !Number.isFinite(s.avg_logprob)) continue;
    if (s.no_speech_prob !== null && s.no_speech_prob >= 0.5) continue; // silence or noise
    const len = Math.max(0.01, s.end - s.start);
    weighted += Math.min(1, Math.exp(s.avg_logprob)) * len;
    total += len;
  }
  return total > 0 ? Math.round((weighted / total) * 100) / 100 : null;
}

/** All the signals for one recording. Pauses and confidence need Whisper's timings. */
export function speakingSignals(input: {
  transcript: string;
  durationSec: number;
  words?: readonly TimedWord[];
  segments?: readonly TimedSegment[];
}): { signals: SpeakingSignals; fillers: FillerCount[] } {
  const fillers = countFillers(input.transcript);
  const wordCount = countSpokenWords(input.transcript);
  const timed = input.words ?? [];
  const span = timed.length >= 2 ? Math.max(...timed.map((w) => w.end)) - Math.min(...timed.map((w) => w.start)) : 0;
  const pauses = timed.length >= 2 ? pausesBetween(timed) : null;
  return {
    fillers,
    signals: {
      duration_sec: round1(Math.max(0, input.durationSec)),
      words: wordCount,
      words_per_minute: wordsPerMinute(wordCount, span > 0 ? span : input.durationSec),
      pauses: pauses?.count ?? null,
      longest_pause_sec: pauses ? pauses.longest : null,
      filler_count: fillers.reduce((n, f) => n + f.count, 0),
      transcript_confidence: input.segments?.length ? transcriptConfidence(input.segments) : null,
    },
  };
}

// ── Feedback (as score-speaking stores and returns it, M7-C2) ───────────────────────────────
export type BetterPhrase = { original: string; better: string; why: string };
export type ScoredSpeaking = {
  scores: SpeakingScores;
  summary: string;
  better_phrases: BetterPhrase[];
  strengths: string[];
  improvements: string[];
  model_answer: string;
};
export type SpeakingFeedback =
  | { detail: "full"; summary: string; better_phrases: BetterPhrase[]; strengths: string[]; improvements: string[]; model_answer: string }
  | { detail: "summary"; summary: string; better_phrases_count: number };

/** Better phrases the screen can highlight: `original` quoted exactly from the transcript, once each. */
export function keepFoundPhrases(transcript: string, phrases: readonly BetterPhrase[]): BetterPhrase[] {
  const seen = new Set<string>();
  return phrases.filter((p) => {
    if (!p.original.trim() || p.original === p.better || seen.has(p.original) || !transcript.includes(p.original)) return false;
    seen.add(p.original);
    return true;
  });
}

export function toSpeakingSummary(scored: Pick<ScoredSpeaking, "summary" | "better_phrases">): Extract<SpeakingFeedback, { detail: "summary" }> {
  return { detail: "summary", summary: scored.summary, better_phrases_count: scored.better_phrases.length };
}

/** Full feedback with the plan's detailed_feedback flag, else the Free summary. */
export function speakingFeedbackFor(scored: ScoredSpeaking, detailedFeedback: boolean): SpeakingFeedback {
  if (!detailedFeedback) return toSpeakingSummary(scored);
  return {
    detail: "full",
    summary: scored.summary,
    better_phrases: scored.better_phrases,
    strengths: scored.strengths,
    improvements: scored.improvements,
    model_answer: scored.model_answer,
  };
}

/** Fewer words than this isn't an answer to score (silence, a mis-start): refused, credits refunded. */
export const MIN_SCORABLE_WORDS = 20;
