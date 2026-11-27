import { describe, expect, it } from "vitest";
import { groupInstruction, type PlayerQuestion, questionGroups, questionRange, sharedList } from "./questions";

const q = (q_no: number, q_type: PlayerQuestion["q_type"], options: Record<string, unknown> = {}): PlayerQuestion => ({
  q_no,
  q_type,
  prompt: `Q${q_no}`,
  options,
});

describe("question groups (M4-F3)", () => {
  const headings = { headings: ["One", "Two", "Three"] };
  const questions = [
    q(3, "tfng"),
    q(1, "matching_headings", headings),
    q(2, "matching_headings", headings),
    q(4, "tfng"),
    q(5, "summary_completion", { word_bank: ["a", "b"] }),
    q(6, "summary_completion", { max_words: 2 }),
    q(8, "tfng"),
  ];

  it("joins consecutive questions of one type and one list, in number order", () => {
    expect(questionGroups(questions).map((g) => [g.first, g.last])).toEqual([
      [1, 2],
      [3, 4],
      [5, 5],
      [6, 6], // a typed summary isn't the word-bank one
      [8, 8], // not consecutive
    ]);
    expect(questionRange({ first: 1, last: 2 })).toBe("Questions 1–2");
    expect(questionRange({ first: 8, last: 8 })).toBe("Question 8");
  });

  it("finds the shared list", () => {
    expect(sharedList(q(1, "matching_headings", headings))).toEqual({ key: "headings", items: ["One", "Two", "Three"] });
    expect(sharedList(q(1, "matching_information", { paragraphs: ["A", "B"] }))).toMatchObject({ key: "paragraphs" });
    expect(sharedList(q(1, "tfng"))).toBeNull();
  });

  it("words each instruction as on the paper", () => {
    const one = (x: PlayerQuestion) => groupInstruction({ first: x.q_no, last: x.q_no, questions: [x] });
    expect(one(q(1, "tfng"))).toContain("TRUE, FALSE or NOT GIVEN");
    expect(one(q(1, "ynng"))).toContain("YES, NO or NOT GIVEN");
    expect(one(q(1, "mcq", { choices: ["a", "b", "c"], select: 2 }))).toBe("Choose TWO letters.");
    expect(one(q(1, "mcq", { choices: ["a", "b"] }))).toBe("Choose the correct letter.");
    expect(one(q(1, "matching_headings", headings))).toContain("list of headings");
    expect(one(q(1, "matching_information", { paragraphs: ["A", "B"] }))).toContain("any letter more than once");
    expect(one(q(1, "matching_features", { features: ["x"], reuse: false }))).not.toContain("more than once");
    expect(one(q(1, "sentence_completion", { max_words: 2, number_allowed: true }))).toContain("NO MORE THAN TWO WORDS AND/OR A NUMBER");
    expect(one(q(1, "flowchart_completion", { word_bank: ["a", "b"] }))).toContain("list of words");
    expect(one(q(1, "short_answer", { max_words: 3 }))).toContain("NO MORE THAN THREE WORDS");
  });
});
