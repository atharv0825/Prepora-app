import { describe, expect, it } from "vitest";
import { ScoreSpeakingResponse } from "../api/score-speaking";
import { countFillers, speakingPartBand } from "../ielts/speaking";
import { MOCK_PART2_TRANSCRIPT, MOCK_SPEAKING_IDS, mockScoreSpeaking } from "./speaking";
import { MockApiError } from "./writing";

const U = "7c000000-0000-4000-8000-000000000001";
const req = { session_id: MOCK_SPEAKING_IDS.session, topic_id: MOCK_SPEAKING_IDS.cueCard, part: 2, audio_path: `${U}/p2.webm`, duration_sec: 110 };

describe("mockScoreSpeaking", () => {
  it("Gold: full feedback, valid by the contract, phrases quoted from the transcript", () => {
    const r = mockScoreSpeaking(req, { plan: "gold", balance: 20 });
    expect(ScoreSpeakingResponse.safeParse(r).success).toBe(true);
    if (r.detail !== "full") throw new Error("expected full");
    expect(r.band).toBe(speakingPartBand(r.scores));
    expect(r.band).toBeGreaterThanOrEqual(5);
    expect(r.band).toBeLessThanOrEqual(6.5);
    expect(r.better_phrases.length).toBeGreaterThanOrEqual(4);
    for (const p of r.better_phrases) expect(MOCK_PART2_TRANSCRIPT).toContain(p.original);
    expect(r.fillers).toEqual(countFillers(MOCK_PART2_TRANSCRIPT));
    expect(r.signals.words_per_minute).toBeGreaterThan(100);
    expect(r).toMatchObject({ credits_charged: 4, balance_after: 16 });
  });
  it("Free: transcript, fillers and bands, the coaching only counted", () => {
    const r = mockScoreSpeaking(req, { plan: "free" });
    expect(r.detail).toBe("summary");
    expect(r).toHaveProperty("transcript");
    expect(r).not.toHaveProperty("better_phrases");
    expect(r).not.toHaveProperty("model_answer");
    expect(r).toMatchObject({ better_phrases_count: 5 });
  });
  it("a short Part 2 answer loses fluency; Part 1 costs 5 credits; errors in the real shapes", () => {
    const short = mockScoreSpeaking({ ...req, duration_sec: 40 }, { transcript: "I like the beach because it is quiet." });
    expect(short.scores.fc).toBeLessThanOrEqual(5);
    expect(mockScoreSpeaking({ ...req, part: 1 }).credits_charged).toBe(5);
    try {
      mockScoreSpeaking(req, { balance: 3 });
      throw new Error("expected an error");
    } catch (e) {
      expect(e).toBeInstanceOf(MockApiError);
      expect((e as MockApiError).body.error).toMatchObject({ code: "insufficient_credits", details: { action_key: "speaking_p2", credits: 4 } });
    }
    expect(() => mockScoreSpeaking({ ...req, audio_path: "x.webm" })).toThrow(MockApiError);
  });
});
