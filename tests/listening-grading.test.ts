// M5-B2: Listening grading, on the exact module the grade-test Edge Function runs
// (supabase/functions/_shared/reading.ts), with the copies checked against packages/shared.
import { describe, expect, it } from "vitest";
import { ListeningQuestionResult } from "../packages/shared/src/api/listening-test";
import { LISTENING_BANDS as SHARED_BANDS, listeningBand as sharedBand, parseListeningQuestion } from "../packages/shared/src/ielts/listening";
import { type GradableQuestion, gradeListeningTest, gradeQuestion, LISTENING_BANDS, listeningBand } from "../supabase/functions/_shared/reading";

const image = { image_url: "https://cdn.prepora.test/x.png", image_alt: "Plan" };
const map: GradableQuestion = {
  q_no: 1,
  q_type: "map_labelling",
  options: { ...image, locations: [{ label: "A", x: 1, y: 1 }, { label: "B", x: 2, y: 2 }, { label: "C", x: 3, y: 3 }] },
  answer: { label: "C" },
  explanation: "Opposite the entrance.",
};
const diagramTyped: GradableQuestion = {
  q_no: 2,
  q_type: "diagram_labelling",
  options: { ...image, marker: { x: 5, y: 5 }, max_words: 2, number_allowed: false },
  answer: { accept: ["filter", "water filter"] },
  explanation: null,
};
const diagramBank: GradableQuestion = {
  q_no: 3,
  q_type: "diagram_labelling",
  options: { ...image, marker: { x: 9, y: 9 }, word_bank: ["pump", "valve", "tank"] },
  answer: { label: "B" },
  explanation: null,
};

describe("Listening grading (M5-B2)", () => {
  it("the keys used here are valid stored questions (M5-C2)", () => {
    for (const q of [map, diagramTyped, diagramBank]) expect(parseListeningQuestion({ ...q, prompt: "x" }).success, q.q_type).toBe(true);
  });

  it("map labelling: the place's letter, any case", () => {
    expect(gradeQuestion(map, "C")).toMatchObject({ correct: true, correct_answer: "C", q_type: "map_labelling" });
    expect(gradeQuestion(map, "c").correct).toBe(true);
    expect(gradeQuestion(map, "A")).toMatchObject({ correct: false, given: "A" });
    expect(gradeQuestion(map, "")).toMatchObject({ correct: false, note: "unanswered" });
  });

  it("diagram labelling, typed: accepted answers, word limit, spelling", () => {
    expect(gradeQuestion(diagramTyped, " Filter. ")).toMatchObject({ correct: true, correct_answer: "filter", also_accepted: ["water filter"] });
    expect(gradeQuestion(diagramTyped, "water filter").correct).toBe(true);
    expect(gradeQuestion(diagramTyped, "filtre").correct).toBe(false);
    expect(gradeQuestion(diagramTyped, "the water filter")).toMatchObject({ correct: false, note: "over_word_limit" });
  });

  it("diagram labelling from a word bank: the letter", () => {
    expect(gradeQuestion(diagramBank, "b")).toMatchObject({ correct: true, correct_answer: "B" });
    expect(gradeQuestion(diagramBank, "valve").correct).toBe(false); // the letter, not the word
  });

  it("a whole test: Reading types and labelling together, results in number order, Listening bands", () => {
    const tfng: GradableQuestion = { q_no: 4, q_type: "tfng", options: {}, answer: { value: "true" }, explanation: null };
    const graded = gradeListeningTest([tfng, diagramBank, map, diagramTyped], { "1": "C", "2": "filter", "3": "A", "4": "not given" });
    expect(graded.results.map((r) => [r.q_no, r.correct])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, false],
    ]);
    expect(graded).toMatchObject({ raw_score: 2, total: 4, band: listeningBand(2, 4) });
    for (const r of graded.results) expect(ListeningQuestionResult.safeParse(r).success).toBe(true);
    expect(() => gradeListeningTest([], {})).toThrow(RangeError);
  });

  it("band table: the Edge copy equals packages/shared for every score and test length", () => {
    expect(LISTENING_BANDS).toEqual(SHARED_BANDS);
    for (let total = 1; total <= 40; total++) {
      for (let raw = 0; raw <= total; raw++) expect(listeningBand(raw, total), `${raw}/${total}`).toBe(sharedBand(raw, total));
    }
    expect([40, 35, 30, 23, 16, 10].map((r) => listeningBand(r))).toEqual([9, 8, 7, 6, 5, 4]);
  });
});
