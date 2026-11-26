import { describe, expect, it } from "vitest";
import { ScoredSpeaking, ScoreSpeakingRequest, ScoreSpeakingResponse, SpeakingFeedback, speakingFeedbackFor, toSpeakingSummary } from "./score-speaking";

const S = "7d000000-0000-4000-8000-000000000001";
const T = "7d000000-0000-4000-8000-000000000002";
const U = "7c000000-0000-4000-8000-000000000001";

const scored: ScoredSpeaking = {
  scores: { fc: 6, lr: 6, gra: 5.5, pron: 6.5 },
  summary: "Clear and relevant.",
  better_phrases: [{ original: "very delicious", better: "absolutely delicious", why: "Stronger." }],
  strengths: ["Covered every point."],
  improvements: ["Fewer fillers."],
  model_answer: "I'd like to talk about…",
};
const base = {
  response_id: "7d100000-0000-4000-8000-000000000001",
  session_id: S,
  topic_id: T,
  part: 2,
  transcript: "Um, the food is very delicious.",
  signals: { duration_sec: 110, words: 6, words_per_minute: 3, pauses: 1, longest_pause_sec: 1.2, filler_count: 1, transcript_confidence: 0.9 },
  fillers: [{ word: "um", count: 1 }],
  scores: scored.scores,
  band: 6,
  credits_charged: 4,
  balance_after: 14,
};

describe("ScoreSpeakingRequest", () => {
  it("takes the session, topic, part and recording path", () => {
    const ok = { session_id: S, topic_id: T, part: 2, audio_path: `${U}/p2.webm`, duration_sec: 110 };
    expect(ScoreSpeakingRequest.parse(ok)).toEqual(ok);
    for (const ext of ["ogg", "m4a", "mp4", "aac", "mp3", "wav"]) {
      expect(ScoreSpeakingRequest.safeParse({ ...ok, audio_path: `${U}/a.${ext}` }).success).toBe(true);
    }
  });
  it("refuses other paths, parts and fields", () => {
    const ok = { session_id: S, topic_id: T, part: 2, audio_path: `${U}/p2.webm` };
    expect(ScoreSpeakingRequest.safeParse({ ...ok, audio_path: `${U}/p2.exe` }).success).toBe(false);
    expect(ScoreSpeakingRequest.safeParse({ ...ok, audio_path: `${U}/a/p2.webm` }).success).toBe(false);
    expect(ScoreSpeakingRequest.safeParse({ ...ok, audio_path: "p2.webm" }).success).toBe(false);
    expect(ScoreSpeakingRequest.safeParse({ ...ok, part: 4 }).success).toBe(false);
    expect(ScoreSpeakingRequest.safeParse({ ...ok, duration_sec: 0 }).success).toBe(false);
    expect(ScoreSpeakingRequest.safeParse({ ...ok, band: 9 }).success).toBe(false);
  });
});

describe("ScoredSpeaking (the AI's output)", () => {
  it("accepts full feedback and refuses off-scale or missing parts", () => {
    expect(ScoredSpeaking.safeParse(scored).success).toBe(true);
    expect(ScoredSpeaking.safeParse({ ...scored, scores: { fc: 6, lr: 6, gra: 6 } }).success).toBe(false);
    expect(ScoredSpeaking.safeParse({ ...scored, scores: { ...scored.scores, pron: 6.3 } }).success).toBe(false);
    expect(ScoredSpeaking.safeParse({ ...scored, strengths: [] }).success).toBe(false);
    expect(ScoredSpeaking.safeParse({ ...scored, better_phrases: [{ original: "x", better: "y" }] }).success).toBe(false);
  });
});

describe("ScoreSpeakingResponse", () => {
  it("full and summary shapes; the summary can't carry the coaching", () => {
    expect(ScoreSpeakingResponse.parse({ ...base, ...speakingFeedbackFor(scored, true) }).detail).toBe("full");
    const summary = ScoreSpeakingResponse.parse({ ...base, ...speakingFeedbackFor(scored, false) });
    expect(summary).toMatchObject({ detail: "summary", better_phrases_count: 1, transcript: base.transcript, fillers: base.fillers });
    expect(ScoreSpeakingResponse.safeParse({ ...base, ...toSpeakingSummary(scored), model_answer: "x" }).success).toBe(false);
  });
  it("the band follows from the criteria; the filler count adds up", () => {
    const full = { ...base, ...speakingFeedbackFor(scored, true) };
    expect(ScoreSpeakingResponse.safeParse({ ...full, band: 6.5 }).success).toBe(false);
    expect(ScoreSpeakingResponse.safeParse({ ...full, signals: { ...base.signals, filler_count: 3 } }).success).toBe(false);
  });
  it("stored feedback uses the same two shapes", () => {
    expect(SpeakingFeedback.parse(speakingFeedbackFor(scored, true))).not.toHaveProperty("scores");
    expect(SpeakingFeedback.parse(speakingFeedbackFor(scored, false))).toEqual({ detail: "summary", summary: "Clear and relevant.", better_phrases_count: 1 });
  });
});
