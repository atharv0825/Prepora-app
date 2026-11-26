// M7-B2: the Speaking rules and audio signals score-speaking runs (supabase/functions/_shared/
// speaking.ts, no imports, so vitest loads the exact file), and their parity with the shared
// contract in packages/shared/src/ielts/speaking.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as shared from "../packages/shared/src/ielts/speaking";
import { MOCK_PART2_TRANSCRIPT } from "../packages/shared/src/mocks/speaking";
import * as fn from "../supabase/functions/_shared/speaking";

describe("Edge copy ↔ shared contract", () => {
  it("fillers, word counts, rate and the part band match", () => {
    expect([...fn.FILLERS]).toEqual([...shared.FILLERS]);
    for (const t of ["", MOCK_PART2_TRANSCRIPT, "Um, uh — you know, I MEAN, umbrella hmm.", "You\n know"]) {
      expect(fn.countFillers(t)).toEqual(shared.countFillers(t));
      expect(fn.countSpokenWords(t)).toBe(shared.countSpokenWords(t));
    }
    for (const [w, d] of [[220, 110], [10, 0], [5, null]] as const) expect(fn.wordsPerMinute(w, d)).toBe(shared.wordsPerMinute(w, d));
    for (const fc of [4, 5.5, 6, 7.5, 9]) {
      for (const pron of [0, 6.5, 9]) {
        const s = { fc, lr: 6, gra: 6.5, pron };
        expect(fn.speakingPartBand(s)).toBe(shared.speakingPartBand(s));
      }
    }
  });
});

const w = (word: string, start: number, end: number) => ({ word, start, end });

describe("speakingSignals", () => {
  const words = [w("Um,", 0.5, 0.8), w("I", 2.0, 2.1), w("like", 2.1, 2.4), w("the", 2.4, 2.5), w("beach.", 2.5, 3.0), w("It's", 6.2, 6.5), w("quiet.", 6.5, 7.0)];
  const segments = [
    { start: 0, end: 3.2, avg_logprob: -0.05, no_speech_prob: 0.01 },
    { start: 3.2, end: 6.0, avg_logprob: -2, no_speech_prob: 0.9 }, // silence: ignored
    { start: 6.0, end: 7.1, avg_logprob: -0.4, no_speech_prob: 0.02 },
  ];

  it("rate over the speech itself, pauses of a second or more, fillers, confidence", () => {
    const { signals, fillers } = fn.speakingSignals({ transcript: "Um, I like the beach. It's quiet.", durationSec: 9.04, words, segments });
    expect(fillers).toEqual([{ word: "um", count: 1 }]);
    expect(signals).toEqual({
      duration_sec: 9,
      words: 7,
      // 7 words over 6.5 s of speech (0.5 → 7.0), not the 9 s recording.
      words_per_minute: 65,
      // 0.8 → 2.0 (1.2 s) and 3.0 → 6.2 (3.2 s).
      pauses: 2,
      longest_pause_sec: 3.2,
      filler_count: 1,
      // (e^-0.05 × 3.2 + e^-0.4 × 1.1) / 4.3
      transcript_confidence: 0.88,
    });
  });

  it("without timings: rate over the recording, no pauses or confidence", () => {
    const { signals } = fn.speakingSignals({ transcript: MOCK_PART2_TRANSCRIPT, durationSec: 110 });
    expect(signals.words_per_minute).toBe(shared.wordsPerMinute(shared.countSpokenWords(MOCK_PART2_TRANSCRIPT), 110));
    expect([signals.pauses, signals.longest_pause_sec, signals.transcript_confidence]).toEqual([null, null, null]);
    expect(signals.filler_count).toBe(shared.countFillers(MOCK_PART2_TRANSCRIPT).reduce((n, f) => n + f.count, 0));
  });

  it("pauses ignore gaps under a second and sort by start; confidence skips silent segments", () => {
    expect(fn.pausesBetween([w("b", 1.5, 2), w("a", 0, 0.9), w("c", 2.95, 3)])).toEqual({ count: 0, longest: 0 });
    expect(fn.pausesBetween([w("a", 0, 1), w("b", 2, 3)])).toEqual({ count: 1, longest: 1 });
    expect(fn.transcriptConfidence([{ start: 0, end: 1, avg_logprob: -1, no_speech_prob: 0.8 }])).toBeNull();
    expect(fn.transcriptConfidence([{ start: 0, end: 1, avg_logprob: 0.2, no_speech_prob: null }])).toBe(1); // capped at 1
    expect(fn.transcriptConfidence([])).toBeNull();
  });

  it("the signals fit the contract's SpeakingSignals", async () => {
    const { SpeakingSignals } = await import("../packages/shared/src/api/score-speaking");
    const { signals } = fn.speakingSignals({ transcript: "Um, I like the beach. It's quiet.", durationSec: 9, words, segments });
    expect(SpeakingSignals.parse(signals)).toEqual(signals);
  });
});

describe("feedback helpers ↔ shared contract (M7-B3)", () => {
  it("trimming for Free and the full shape match; better phrases must quote the transcript", async () => {
    const sharedApi = await import("../packages/shared/src/api/score-speaking");
    const { mockScoredSpeaking } = await import("../packages/shared/src/mocks/speaking");
    const scored = mockScoredSpeaking(MOCK_PART2_TRANSCRIPT, 110, 2);
    expect(fn.speakingFeedbackFor(scored, true)).toEqual(sharedApi.speakingFeedbackFor(scored, true));
    expect(fn.speakingFeedbackFor(scored, false)).toEqual(sharedApi.speakingFeedbackFor(scored, false));
    const p = (original: string, better = "x") => ({ original, better, why: "Because." });
    expect(fn.keepFoundPhrases("I feel very relax there.", [p("feel very relax"), p("feel very relax"), p("not said"), p("there", "there"), p(" ")])).toEqual([p("feel very relax")]);
    expect(fn.MIN_SCORABLE_WORDS).toBe(20);
  });

  it("the Deno schema keeps the contract's path rule", () => {
    const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
    const pathRe = (src: string) => src.match(/SpeakingAudioPath = z\s*\.string\(\)\s*\.regex\(\s*(\/.+\/),/)?.[1];
    expect(pathRe(read("../supabase/functions/_shared/speaking_schemas.ts"))).toBeTruthy();
    expect(pathRe(read("../supabase/functions/_shared/speaking_schemas.ts"))).toBe(pathRe(read("../packages/shared/src/api/score-speaking.ts")));
  });
});

describe("sessions, rounding and examiner limits ↔ shared (M8-B1..B3)", async () => {
  const bands = await import("../packages/shared/src/ielts/bands");
  const session = await import("../packages/shared/src/ielts/speaking-session");
  it("ieltsRound and overallBand match", () => {
    for (let x = 0; x <= 9; x += 0.05) {
      const v = Math.round(x * 100) / 100;
      expect(fn.ieltsRound(v)).toBe(bands.ieltsRound(v));
    }
    for (const bs of [[6, 6.5, 6.5], [6, 6, 6.5], [7, 6.5, 7], [5]]) expect(fn.overallBand(bs)).toBe(bands.overallBand(bs));
  });
  it("the state machine and the examiner's limits match", () => {
    for (const mode of ["part1", "part2", "part3", "full_test"] as const) {
      expect(fn.partsOf(mode)).toEqual(session.partsOf(mode));
      for (const scored of [[], [1], [1, 2], [2], [1, 2, 3], [3]]) expect(fn.sessionStage(mode, scored)).toBe(session.sessionStage(mode, scored));
    }
    expect(fn.sessionOverallBand("full_test", { 1: 6, 2: 6.5, 3: 6.5 })).toBe(session.sessionOverallBand("full_test", { 1: 6, 2: 6.5, 3: 6.5 }));
    expect(fn.QUESTIONS_PER_PART).toEqual(session.QUESTIONS_PER_PART);
    for (const asked of [0, 3, 4, 5]) for (const stop of [true, false]) expect(fn.examinerDone(1, asked, stop)).toBe(session.examinerDone(1, asked, stop));
  });
});

describe("combineSignals (Parts 1 and 3)", () => {
  const sig = (over: Partial<ReturnType<typeof fn.speakingSignals>["signals"]>) => ({
    duration_sec: 30, words: 60, words_per_minute: 120, pauses: 1, longest_pause_sec: 1.5, filler_count: 1, transcript_confidence: 0.9, ...over,
  });
  it("adds durations, words, pauses and fillers; rate over the total speech; confidence weighted by length", () => {
    const { signals, fillers } = fn.combineSignals([
      { signals: sig({}), fillers: [{ word: "um", count: 1 }] },
      { signals: sig({ duration_sec: 60, words: 100, words_per_minute: 100, pauses: 3, longest_pause_sec: 3.2, filler_count: 2, transcript_confidence: 0.6 }), fillers: [{ word: "um", count: 1 }, { word: "uh", count: 1 }] },
    ]);
    // Speech: 60/120 min + 100/100 min = 1.5 min → 160 words / 1.5 = 107 wpm.
    expect(signals).toEqual({ duration_sec: 90, words: 160, words_per_minute: 107, pauses: 4, longest_pause_sec: 3.2, filler_count: 3, transcript_confidence: 0.7 });
    expect(fillers).toEqual([{ word: "um", count: 2 }, { word: "uh", count: 1 }]);
  });
  it("answers without timings or confidence", () => {
    const { signals } = fn.combineSignals([{ signals: sig({ pauses: null, longest_pause_sec: null, transcript_confidence: null, words_per_minute: null }), fillers: [] }]);
    expect([signals.pauses, signals.longest_pause_sec, signals.transcript_confidence, signals.words_per_minute]).toEqual([null, null, null, 120]);
  });
  it("the stored conversation transcript", () => {
    expect(fn.conversationTranscript([{ question: " Where are you from? ", answer: "Um, Pune. " }, { question: "Why?", answer: "It's home." }])).toBe(
      "Examiner: Where are you from?\nYou: Um, Pune.\n\nExaminer: Why?\nYou: It's home.",
    );
  });
});
