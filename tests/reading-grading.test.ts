// M4-B3: grading of all 11 Reading question types and band conversion, tested on the exact code
// the grade-test Edge Function runs (supabase/functions/_shared/reading.ts has no imports, so
// vitest can load it), plus parity with the shared contract in packages/shared/src/ielts.
import { describe, expect, it } from "vitest";
import * as shared from "../packages/shared/src/ielts/bands";
import * as sharedReading from "../packages/shared/src/ielts/reading";
import {
  type GradableQuestion,
  READING_BANDS,
  countWords,
  gradeQuestion,
  gradeTest,
  normalizeText,
  readingBand,
  withinWordLimit,
} from "../supabase/functions/_shared/reading";

const q = (over: Partial<GradableQuestion> & Pick<GradableQuestion, "q_type" | "answer">): GradableQuestion => ({
  q_no: 1,
  options: {},
  explanation: "Because.",
  ...over,
});

/** [given, correct?] pairs for one question. */
function expectMarks(question: GradableQuestion, cases: [unknown, boolean][]) {
  for (const [given, correct] of cases) {
    expect(gradeQuestion(question, given).correct, `${question.q_type} given ${JSON.stringify(given)}`).toBe(correct);
  }
}

describe("Edge copy ↔ packages/shared", () => {
  it("band tables are identical and agree for every score and test length", () => {
    expect(READING_BANDS).toEqual(shared.READING_BANDS);
    for (const type of ["academic", "general"] as const) {
      for (let total = 1; total <= 40; total++) {
        for (let raw = 0; raw <= total; raw++) {
          expect(readingBand(type, raw, total)).toBe(shared.readingBand(type, raw, total));
        }
      }
    }
  });

  it("typed-answer rules are identical", () => {
    const samples = ["  The City Council. ", "“pollen”", "children’s", "well-known writer", "15 March", "5.20", "a  b   c", "(Dunlop)", ""];
    for (const s of samples) {
      expect(normalizeText(s), s).toBe(sharedReading.normalizeText(s));
      expect(countWords(s), s).toEqual(sharedReading.countWords(s));
      for (const limit of [{ max_words: 1, number_allowed: false }, { max_words: 2, number_allowed: true }]) {
        expect(withinWordLimit(s, limit), s).toBe(sharedReading.withinWordLimit(s, limit));
      }
    }
  });
});

describe("grading the 11 types (M4-B3)", () => {
  it("MCQ: exactly the right letters, any order, case-insensitive", () => {
    expectMarks(q({ q_type: "mcq", options: { choices: ["a", "b", "c"], select: 1 }, answer: { labels: ["B"] } }), [
      [["B"], true],
      ["B", true],
      [["b"], true],
      [["A"], false],
      [["A", "B"], false],
      [[], false],
    ]);
    expectMarks(q({ q_type: "mcq", options: { choices: ["a", "b", "c", "d", "e"], select: 2 }, answer: { labels: ["A", "C"] } }), [
      [["A", "C"], true],
      [["C", "A"], true],
      [["A"], false],
      [["A", "C", "D"], false],
      [["A", "A"], false],
      [["A", "D"], false],
    ]);
  });

  it("True/False/Not Given", () => {
    expectMarks(q({ q_type: "tfng", answer: { value: "not_given" } }), [
      ["not_given", true],
      ["Not Given", true],
      ["NOT GIVEN", true],
      ["NG", true],
      ["false", false],
      ["no", false],
    ]);
    expectMarks(q({ q_type: "tfng", answer: { value: "true" } }), [
      ["true", true],
      [" TRUE ", true],
      ["yes", false], // a Yes/No answer to a True/False question is wrong, as in the test
      ["T", false],
    ]);
  });

  it("Yes/No/Not Given", () => {
    expectMarks(q({ q_type: "ynng", answer: { value: "no" } }), [
      ["no", true],
      ["No", true],
      ["false", false],
      ["not_given", false],
    ]);
  });

  it("matching headings, information and features: the label, any case", () => {
    expectMarks(q({ q_type: "matching_headings", options: { headings: ["x", "y", "z", "w"] }, answer: { label: "iv" } }), [
      ["iv", true],
      ["IV", true],
      ["iii", false],
      ["4", false],
    ]);
    expectMarks(q({ q_type: "matching_information", options: { paragraphs: ["A", "B", "C"] }, answer: { label: "C" } }), [
      ["C", true],
      ["c", true],
      ["B", false],
    ]);
    expectMarks(q({ q_type: "matching_features", options: { features: ["x", "y"] }, answer: { label: "A" } }), [
      ["A", true],
      ["B", false],
      [["A"], false],
    ]);
  });

  it("sentence completion: case and punctuation don't matter, spelling does", () => {
    const question = q({ q_type: "sentence_completion", options: { max_words: 2 }, answer: { accept: ["pollen", "flower pollen"] } });
    expectMarks(question, [
      ["pollen", true],
      ["Pollen.", true],
      ["  FLOWER   pollen ", true],
      ["polen", false],
      ["pollens", false],
    ]);
  });

  it("over the word limit is wrong even with the right words, and noted", () => {
    const question = q({ q_type: "sentence_completion", options: { max_words: 2 }, answer: { accept: ["flower pollen"] } });
    const result = gradeQuestion(question, "fresh flower pollen");
    expect(result).toMatchObject({ correct: false, note: "over_word_limit", correct_answer: "flower pollen" });
  });

  it("summary and flow-chart completion: typed, or from a word bank", () => {
    expectMarks(q({ q_type: "summary_completion", options: { max_words: 1 }, answer: { accept: ["Dunlop"] } }), [
      ["dunlop", true],
      ["Dunlop's", false],
      ["John Dunlop", false],
    ]);
    expectMarks(q({ q_type: "summary_completion", options: { word_bank: ["a", "b", "c"] }, answer: { label: "B" } }), [
      ["B", true],
      ["b", true],
      ["accumulators", false],
    ]);
    expectMarks(q({ q_type: "flowchart_completion", options: { max_words: 1 }, answer: { accept: ["rises"] } }), [
      ["rises", true],
      ["Rises", true],
      ["rise", false],
    ]);
    expectMarks(q({ q_type: "flowchart_completion", options: { word_bank: ["a", "b"] }, answer: { label: "A" } }), [["a", true]]);
  });

  it("note/table completion: AND/OR A NUMBER", () => {
    const money = q({ q_type: "note_table_completion", options: { max_words: 1, number_allowed: true }, answer: { accept: ["5.20"] } });
    expectMarks(money, [
      ["5.20", true],
      [" 5.20 ", true],
      ["5.2", false],
    ]);
    const cycle = q({ q_type: "note_table_completion", options: { max_words: 1, number_allowed: true }, answer: { accept: ["90", "ninety"] } });
    expectMarks(cycle, [
      ["90", true],
      ["Ninety", true],
      ["90 90", false],
    ]);
  });

  it("short answer: any accepted alternative", () => {
    const question = q({
      q_type: "short_answer",
      options: { max_words: 2, number_allowed: true },
      answer: { accept: ["twelve months", "12 months", "one year", "a year"] },
    });
    expectMarks(question, [
      ["12 months", true],
      ["One year", true],
      ["twelve month", false],
      ["for twelve months", false],
    ]);
    expect(gradeQuestion(question, "a year")).toMatchObject({
      correct_answer: "twelve months",
      also_accepted: ["12 months", "one year", "a year"],
    });
  });

  it("no answer is wrong and noted; a wrong shape is wrong", () => {
    const question = q({ q_type: "short_answer", options: { max_words: 2 }, answer: { accept: ["x"] } });
    for (const given of [undefined, null, "", "   ", []]) {
      expect(gradeQuestion(question, given)).toMatchObject({ correct: false, given: null, note: "unanswered" });
    }
    expect(gradeQuestion(question, ["x"]).correct).toBe(false);
    expect(gradeQuestion(q({ q_type: "tfng", answer: { value: "true" } }), ["true"]).correct).toBe(false);
  });

  it("a malformed answer key is never marked correct", () => {
    expect(gradeQuestion(q({ q_type: "mcq", answer: null }), ["A"]).correct).toBe(false);
    expect(gradeQuestion(q({ q_type: "mcq", answer: { labels: [] } }), []).correct).toBe(false);
    expect(gradeQuestion(q({ q_type: "tfng", answer: {} }), "").correct).toBe(false);
    expect(gradeQuestion(q({ q_type: "short_answer", answer: { accept: [] } }), "x").correct).toBe(false);
  });

  it("results carry the answer and explanation to show after submission", () => {
    expect(gradeQuestion(q({ q_type: "mcq", options: { choices: ["a", "b"] }, answer: { labels: ["A"] } }), ["B"])).toEqual({
      q_no: 1,
      q_type: "mcq",
      correct: false,
      given: ["B"],
      correct_answer: ["A"],
      also_accepted: [],
      note: null,
      explanation: "Because.",
    });
  });
});

describe("gradeTest: raw score → band (M4-B3)", () => {
  // 40 short-answer questions whose answer is their own number.
  const full = Array.from({ length: 40 }, (_, i) =>
    q({ q_no: i + 1, q_type: "short_answer", options: { max_words: 1, number_allowed: true }, answer: { accept: [String(i + 1)] } }),
  );
  const answersFor = (correctCount: number) =>
    Object.fromEntries(full.map((x) => [String(x.q_no), x.q_no <= correctCount ? String(x.q_no) : "wrong"]));

  it.each([
    ["academic", 40, 9],
    ["academic", 30, 7],
    ["academic", 23, 6],
    ["academic", 0, 0],
    ["general", 40, 9],
    ["general", 30, 6],
    ["general", 34, 7],
  ] as const)("%s, %i/40 correct → band %d", (type, correct, band) => {
    const graded = gradeTest(type, full, answersFor(correct));
    expect(graded).toMatchObject({ raw_score: correct, total: 40, band });
    expect(graded.results).toHaveLength(40);
  });

  it("short tests are scaled; results come back in question order", () => {
    const short = full.slice(0, 14).reverse();
    const graded = gradeTest("academic", short, answersFor(10));
    expect(graded).toMatchObject({ raw_score: 10, total: 14, band: 6.5 }); // 10/14 → 28/40
    expect(graded.results.map((r) => r.q_no)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("answers to questions that don't exist are ignored; a test without questions is refused", () => {
    expect(gradeTest("general", full.slice(0, 2), { "1": "1", "2": "2", "3": "3" })).toMatchObject({ raw_score: 2, total: 2, band: 9 });
    expect(() => gradeTest("academic", [], {})).toThrow(RangeError);
  });
});
