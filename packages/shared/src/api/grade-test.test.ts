import { describe, expect, it } from "vitest";
import { GradeTestRequest, GradeTestResponse } from "./grade-test";

const testId = "00000000-0000-4000-8000-000000000001";

describe("grade-test contract (M4-C2)", () => {
  it("request: answers by question number", () => {
    const ok = GradeTestRequest.parse({ module: "reading", test_id: testId, answers: { "1": "true", "2": ["A", "C"], "40": "pollen" }, time_taken_sec: 3500 });
    expect(ok.answers["2"]).toEqual(["A", "C"]);
    for (const bad of [
      { module: "reading", test_id: testId, answers: { "41": "x" } },
      { module: "reading", test_id: testId, answers: { "0": "x" } },
      { module: "reading", test_id: testId, answers: { "01": "x" } },
      { module: "reading", test_id: testId, answers: { "1": "x".repeat(201) } },
      { module: "listening", test_id: testId, answers: {} },
      { module: "reading", test_id: "nope", answers: {} },
      { module: "reading", test_id: testId, answers: {}, raw_score: 40 },
    ]) {
      expect(GradeTestRequest.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("response: results with the correct answers; bands in half steps", () => {
    const response = {
      attempt_id: testId,
      module: "reading",
      test_id: testId,
      raw_score: 1,
      total: 2,
      band: 5.5,
      results: [
        { q_no: 1, q_type: "tfng", correct: true, given: "true", correct_answer: "true", explanation: "Line 3." },
        { q_no: 2, q_type: "sentence_completion", correct: false, given: "fresh flower pollen", correct_answer: "pollen", also_accepted: ["flower pollen"], note: "over_word_limit", explanation: null },
      ],
      allowance: { type: "reading_tests", used: 1, limit: 2 },
    };
    const parsed = GradeTestResponse.parse(response);
    expect(parsed.results[0]).toMatchObject({ also_accepted: [], note: null });
    expect(GradeTestResponse.safeParse({ ...response, band: 5.25 }).success).toBe(false);
  });
});
