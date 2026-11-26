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
