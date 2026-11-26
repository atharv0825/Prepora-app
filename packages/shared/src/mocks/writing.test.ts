import { describe, expect, it } from "vitest";
import { OcrWritingResponse } from "../api/ocr-writing";
import { ScoreWritingResponse } from "../api/score-writing";
import { countEssayWords, writingTaskBand } from "../ielts/writing";
import {
  MOCK_TASK2_ESSAY,
  MOCK_TASK_IDS,
  MockApiError,
  mockCorrections,
  mockOcrWriting,
  mockScoreWriting,
  mockScores,
} from "./writing";

const USER = "6c000000-0000-4000-8000-000000000002";

describe("mockScoreWriting", () => {
  it("Gold: the full feedback, valid by the contract, built from the essay", () => {
    const r = mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: MOCK_TASK2_ESSAY }, { plan: "gold", balance: 50 });
    expect(ScoreWritingResponse.safeParse(r).success).toBe(true);
    if (r.detail !== "full") throw new Error("expected full");
    expect(r.task_no).toBe(2);
    expect(r.word_count).toBe(countEssayWords(MOCK_TASK2_ESSAY));
    expect(r.word_count).toBeGreaterThanOrEqual(250);
    expect(r.band).toBe(writingTaskBand(r.scores));
    expect(r.band).toBeGreaterThanOrEqual(5.5);
    expect(r.band).toBeLessThanOrEqual(6.5);
    expect(r.balance_after).toBe(46);
    // Every correction quotes the essay exactly, so the screen can highlight it.
    expect(r.corrections.length).toBeGreaterThanOrEqual(8);
    for (const c of r.corrections) expect(MOCK_TASK2_ESSAY).toContain(c.original);
    expect(r.strengths.length).toBeGreaterThan(0);
    expect(r.model_answer.length).toBeGreaterThan(200);
  });

  it("Free: the summary only, with the number of corrections", () => {
    const r = mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: MOCK_TASK2_ESSAY }, { plan: "free" });
    expect(r.detail).toBe("summary");
    expect(Object.keys(r).sort()).toEqual(
      ["balance_after", "band", "corrections_count", "credits_charged", "detail", "min_words", "scores", "submission_id", "summary", "task_id", "task_no", "word_count"].sort(),
    );
    expect(r).toMatchObject({ corrections_count: mockCorrections(MOCK_TASK2_ESSAY).length });
  });

  it("depends on the text: a short Task 1 answer loses Task Achievement and says why", () => {
    const short = "The chart shows rainfall in three cities. London has the most rain in winter.";
    const r = mockScoreWriting({ task_id: MOCK_TASK_IDS.task1Academic, text: short });
    expect(r.task_no).toBe(1);
    expect(r.min_words).toBe(150);
    expect(r.scores.ta).toBe(5);
    expect(r.summary).toContain("under the 150-word minimum");
    if (r.detail === "full") expect(r.corrections).toEqual([]);
    expect(mockScores(short, 1)).toEqual(r.scores); // deterministic
  });

  it("answers errors in the real shapes", () => {
    const thrown = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e as MockApiError;
      }
      throw new Error("expected an error");
    };
    const invalid = thrown(() => mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: "" }));
    expect(invalid).toBeInstanceOf(MockApiError);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("validation_failed");
    const broke = thrown(() => mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: "Essay" }, { balance: 3 }));
    expect(broke.status).toBe(402);
    expect(broke.body.error).toMatchObject({ code: "insufficient_credits", details: { action_key: "writing_t2", credits: 4, balance: 3 } });
  });

  it("gives each call its own submission id", () => {
    const a = mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: "One." });
    const b = mockScoreWriting({ task_id: MOCK_TASK_IDS.task2, text: "One." });
    expect(a.submission_id).not.toBe(b.submission_id);
  });
});

describe("mockOcrWriting", () => {
  it("two pages: the essay split across them, joined for the editor", () => {
    const paths = [`${USER}/p1.jpg`, `${USER}/p2.jpg`];
    const r = mockOcrWriting({ photo_paths: paths }, { plan: "gold", balance: 10 });
    expect(OcrWritingResponse.safeParse(r).success).toBe(true);
    expect(r.pages.map((p) => p.path)).toEqual(paths);
    expect(r.text).toBe(MOCK_TASK2_ESSAY);
    expect(r).toMatchObject({ credits_charged: 1, balance_after: 9, word_count: countEssayWords(MOCK_TASK2_ESSAY) });
  });

  it("one page: partly legible, with a guessed word to check", () => {
    const r = mockOcrWriting({ photo_paths: [`${USER}/p1.jpg`] });
    expect(r.pages[0].legibility).toBe("partial");
    expect(r.text).toContain("[?]");
  });

  it("Free: feature_not_in_plan, as the real function", () => {
    expect(() => mockOcrWriting({ photo_paths: [`${USER}/p1.jpg`] }, { plan: "free" })).toThrow(MockApiError);
  });
});
