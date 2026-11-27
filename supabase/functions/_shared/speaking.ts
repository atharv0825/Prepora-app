// Speaking rules and audio signals for score-speaking (M7-B2). Pure TypeScript with NO imports, so
// the same file runs in the Edge Function (Deno) and in vitest (tests/speaking-signals.test.ts),
// which checks the copied rules agree with packages/shared/src/ielts/speaking.ts:
//   speakingPartBand, FILLERS, countFillers, countSpokenWords, wordsPerMinute.
//
// The signals (speakingSignals) are measured from the transcript and the speech-to-text timings
// (stt.ts, M7-B1) and given to the AI with the transcript (M7-B3):
//   * words_per_minute: over the speech itself (first word's start to last word's end), so
//     silence before the first word or after the last doesn't count; without timings, over the
//     whole recording.
//   * pauses: silences of PAUSE_SEC or more between consecutive words; longest_pause_sec. Gemini
//     (stt.ts) gives no word timings: it reports the silences it hears, which are used instead.
//   * filler_count: hesitation fillers (um, uh, er, "you know"…), as the contract counts them.
//   * transcript_confidence: how sure the speech model was (0–1), the time-weighted mean of
//     exp(avg_logprob) over segments that hold speech. A low value suggests speech that was hard
//     to understand; the AI uses it for Pronunciation alongside the transcript, never accent.
//     Gemini gives no log-probabilities, so it's null today (the contract allows it).

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

/**
 * All the signals for one recording. Pauses come from word timings when there are some, else from
 * the silences the speech-to-text model reported (Gemini, stt.ts: approximate); with neither,
 * null. Confidence needs per-segment log-probabilities (Gemini gives none: null).
 */
export function speakingSignals(input: {
  transcript: string;
  durationSec: number;
  words?: readonly TimedWord[];
  segments?: readonly TimedSegment[];
  /** Lengths in seconds of silences between words, as reported by the speech-to-text model. */
  silences?: readonly number[];
}): { signals: SpeakingSignals; fillers: FillerCount[] } {
  const fillers = countFillers(input.transcript);
  const wordCount = countSpokenWords(input.transcript);
  const timed = input.words ?? [];
  const span = timed.length >= 2 ? Math.max(...timed.map((w) => w.end)) - Math.min(...timed.map((w) => w.start)) : 0;
  const reported = input.silences?.filter((len) => len >= PAUSE_SEC);
  const pauses = timed.length >= 2
    ? pausesBetween(timed)
    : reported
    ? { count: reported.length, longest: round1(Math.max(0, ...reported)) }
    : null;
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

// ── Sessions, rounding and examiner turns (M8-B1..B3) ───────────────────────────────────────
// Copies of packages/shared/src/ielts/bands.ts (ieltsRound, overallBand) and
// ielts/speaking-session.ts; tests/speaking-signals.test.ts checks they agree.

export function ieltsRound(average: number): number {
  if (!Number.isFinite(average) || average < 0 || average > 9) throw new RangeError(`not a band average: ${average}`);
  const v = Math.round(average * 1e9) / 1e9;
  const whole = Math.floor(v);
  const frac = v - whole;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
}

export function overallBand(bands: readonly number[]): number {
  if (!bands.length) throw new RangeError("no bands to average");
  return ieltsRound(bands.reduce((a, b) => a + b, 0) / bands.length);
}

export type SessionMode = "part1" | "part2" | "part3" | "full_test";
export type SessionStage = "part1" | "part2" | "part3" | "finished";

export function partsOf(mode: SessionMode): (1 | 2 | 3)[] {
  return mode === "full_test" ? [1, 2, 3] : [Number(mode.slice(4)) as 1 | 2 | 3];
}

export function sessionStage(mode: SessionMode, scored: Iterable<number>): SessionStage {
  const done = new Set(scored);
  const next = partsOf(mode).find((p) => !done.has(p));
  return next ? (`part${next}` as SessionStage) : "finished";
}

export function sessionOverallBand(mode: SessionMode, bands: Partial<Record<1 | 2 | 3, number>>): number | null {
  const parts = partsOf(mode);
  if (parts.some((p) => bands[p] === undefined)) return null;
  return overallBand(parts.map((p) => bands[p]!));
}

export const QUESTIONS_PER_PART: Record<1 | 3, { min: number; max: number }> = { 1: { min: 4, max: 5 }, 3: { min: 4, max: 5 } };

/** Follow-ups the examiner may add: Part 1 sticks to the set; Part 3 is a discussion. */
export const MAX_FOLLOW_UPS: Record<1 | 3, number> = { 1: 1, 3: 3 };

export function examinerDone(part: 1 | 3, asked: number, examinerWantsToStop: boolean): boolean {
  const { min, max } = QUESTIONS_PER_PART[part];
  if (asked >= max) return true;
  if (asked < min) return false;
  return examinerWantsToStop;
}

/** Parts 1 and 3: under this many words in all the answers isn't scorable (refused and refunded). */
export const MIN_SCORABLE_WORDS_CONVERSATION = 30;

/**
 * One set of signals for several answers (Parts 1 and 3): durations, words, pauses and fillers add
 * up; words per minute is over the total speech; the longest pause is the longest of any answer;
 * the confidence is weighted by each answer's length.
 */
export function combineSignals(parts: readonly { signals: SpeakingSignals; fillers: FillerCount[] }[]): { signals: SpeakingSignals; fillers: FillerCount[] } {
  const sum = (f: (s: SpeakingSignals) => number) => parts.reduce((n, p) => n + f(p.signals), 0);
  const duration = sum((s) => s.duration_sec);
  const words = sum((s) => s.words);
  // Each answer's speaking time, recovered from its own rate (words / wpm), else its length.
  const speech = parts.reduce((n, p) => n + (p.signals.words_per_minute ? (p.signals.words / p.signals.words_per_minute) * 60 : p.signals.duration_sec), 0);
  const timed = parts.filter((p) => p.signals.pauses !== null);
  const confident = parts.filter((p) => p.signals.transcript_confidence !== null && p.signals.duration_sec > 0);
  const confWeight = confident.reduce((n, p) => n + p.signals.duration_sec, 0);
  const fillers = new Map<string, number>();
  for (const p of parts) for (const f of p.fillers) fillers.set(f.word, (fillers.get(f.word) ?? 0) + f.count);
  const fillerList = [...fillers].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  return {
    fillers: fillerList,
    signals: {
      duration_sec: Math.round(duration * 10) / 10,
      words,
      words_per_minute: wordsPerMinute(words, speech > 0 ? speech : duration),
      pauses: timed.length ? timed.reduce((n, p) => n + p.signals.pauses!, 0) : null,
      longest_pause_sec: timed.length ? Math.max(...timed.map((p) => p.signals.longest_pause_sec ?? 0)) : null,
      filler_count: fillerList.reduce((n, f) => n + f.count, 0),
      transcript_confidence: confWeight > 0
        ? Math.round((confident.reduce((n, p) => n + p.signals.transcript_confidence! * p.signals.duration_sec, 0) / confWeight) * 100) / 100
        : null,
    },
  };
}

/** The stored transcript of a conversation: each question and its answer, examiner first. */
export function conversationTranscript(turns: readonly { question: string; answer: string }[]): string {
  return turns.map((t) => `Examiner: ${t.question.trim()}\nYou: ${t.answer.trim()}`).join("\n\n");
}
