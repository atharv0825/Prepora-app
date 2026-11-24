import { describe, expect, it } from "vitest";
import {
  answerLabels,
  countWords,
  letterLabel,
  normalizeText,
  parseReadingQuestion,
  readingQuestionTypes,
  romanLabel,
  withinWordLimit,
} from "./reading";

// One valid example per type.
const valid = {
  mcq: { prompt: "What is the main idea?", options: { choices: ["A cat", "A dog", "A bird"] }, answer: { labels: ["B"] } },
  tfng: { prompt: "The bridge opened in 1990.", options: {}, answer: { value: "not_given" } },
  ynng: { prompt: "The writer supports the plan.", options: {}, answer: { value: "no" } },
  matching_headings: { prompt: "Paragraph B", options: { headings: ["Early days", "A new method", "Costs"] }, answer: { label: "ii" } },
  matching_information: { prompt: "a mention of the cost", options: { paragraphs: ["A", "B", "C", "D"] }, answer: { label: "C" } },
  matching_features: { prompt: "found the first fossil", options: { features: ["Dr Ito", "Prof Bell"] }, answer: { label: "A" } },
  sentence_completion: { prompt: "Bees need ___ to survive.", options: { max_words: 2 }, answer: { accept: ["pollen", "flower pollen"] } },
  summary_completion: { prompt: "The ___ was built first.", options: { word_bank: ["tower", "bridge", "road"] }, answer: { label: "B" } },
  note_table_completion: { prompt: "Year founded: ___", options: { max_words: 1, number_allowed: true }, answer: { accept: ["1887"] } },
  flowchart_completion: { prompt: "Wash → ___ → dry", options: { max_words: 1 }, answer: { accept: ["rinse"] } },
  short_answer: { prompt: "Who funded the study?", options: { max_words: 3 }, answer: { accept: ["the city council"] } },
} as const;

describe("question schemas (M4-C2)", () => {
  it("has a valid example for all 11 types", () => {
    expect(Object.keys(valid).sort()).toEqual([...readingQuestionTypes].sort());
    for (const [q_type, q] of Object.entries(valid)) {
      const parsed = parseReadingQuestion({ q_type, ...q });
      expect(parsed.success, `${q_type}: ${parsed.error?.message}`).toBe(true);
    }
  });

  it("fills defaults", () => {
    const mcq = parseReadingQuestion({ q_type: "mcq", ...valid.mcq });
    expect(mcq.data?.options).toEqual({ choices: ["A cat", "A dog", "A bird"], select: 1 });
    const sentence = parseReadingQuestion({ q_type: "sentence_completion", ...valid.sentence_completion });
    expect(sentence.data?.options).toEqual({ max_words: 2, number_allowed: false });
  });

  const invalid: [string, { prompt: unknown; options: unknown; answer: unknown }, string][] = [
    ["mcq", { ...valid.mcq, answer: { labels: ["D"] } }, "a letter outside the choices"],
    ["mcq", { ...valid.mcq, options: { choices: valid.mcq.options.choices, select: 2 } }, "fewer letters than select"],
    ["mcq", { ...valid.mcq, options: { choices: ["Only one"] } }, "one choice"],
    ["tfng", { ...valid.tfng, answer: { value: "yes" } }, "YNNG value in TFNG"],
    ["ynng", { ...valid.ynng, answer: { value: "true" } }, "TFNG value in YNNG"],
    ["tfng", { ...valid.tfng, options: { choices: ["x"] } }, "options on TFNG"],
    ["matching_headings", { ...valid.matching_headings, answer: { label: "iv" } }, "a heading that doesn't exist"],
    ["matching_information", { ...valid.matching_information, answer: { label: "E" } }, "a paragraph not listed"],
    ["matching_information", { ...valid.matching_information, options: { paragraphs: ["A", "A"] } }, "a paragraph twice"],
    ["matching_features", { ...valid.matching_features, answer: { label: "C" } }, "a feature that doesn't exist"],
    ["sentence_completion", { ...valid.sentence_completion, prompt: "No gap here" }, "no gap"],
    ["sentence_completion", { ...valid.sentence_completion, prompt: "Two ___ gaps ___" }, "two gaps"],
    ["sentence_completion", { ...valid.sentence_completion, answer: { accept: ["far too many words"] } }, "an answer over the limit"],
    ["sentence_completion", { ...valid.sentence_completion, answer: { accept: [] } }, "no accepted answer"],
    ["sentence_completion", { ...valid.sentence_completion, options: { max_words: 6 } }, "a limit over 5"],
    ["summary_completion", { ...valid.summary_completion, answer: { label: "Z" } }, "a word not in the bank"],
    ["summary_completion", { ...valid.summary_completion, answer: { accept: ["tower"] } }, "a typed answer for a word bank"],
    ["short_answer", { ...valid.short_answer, answer: { label: "A" } }, "a label for a typed answer"],
    ["essay", valid.short_answer, "an unknown type"],
  ];
  it.each(invalid)("%s: refuses %#: %s", (q_type, q) => {
    expect(parseReadingQuestion({ q_type, ...q }).success).toBe(false);
  });

  it("never puts the answer in options (the answer is a separate column)", () => {
    for (const [q_type, q] of Object.entries(valid)) {
      const parsed = parseReadingQuestion({ q_type, ...q });
      expect(JSON.stringify(parsed.data?.options)).not.toContain('"answer"');
    }
  });
});

describe("labels", () => {
  it("letters and numerals", () => {
    expect([0, 1, 25].map(letterLabel)).toEqual(["A", "B", "Z"]);
    expect([0, 3, 8, 14].map(romanLabel)).toEqual(["i", "iv", "ix", "xv"]);
    expect(() => letterLabel(26)).toThrow(RangeError);
    expect(() => romanLabel(15)).toThrow(RangeError);
  });

  it("what a student can answer per type", () => {
    expect(answerLabels({ q_type: "mcq", options: valid.mcq.options })).toEqual(["A", "B", "C"]);
    expect(answerLabels({ q_type: "tfng", options: {} })).toEqual(["true", "false", "not_given"]);
    expect(answerLabels({ q_type: "matching_headings", options: valid.matching_headings.options })).toEqual(["i", "ii", "iii"]);
    expect(answerLabels({ q_type: "matching_information", options: valid.matching_information.options })).toEqual(["A", "B", "C", "D"]);
    expect(answerLabels({ q_type: "summary_completion", options: valid.summary_completion.options })).toEqual(["A", "B", "C"]);
    expect(answerLabels({ q_type: "sentence_completion", options: { max_words: 2 } })).toEqual([]);
  });
});

describe("typed answers", () => {
  it("normalises case, spaces, quotes and surrounding punctuation, not spelling", () => {
    expect(normalizeText("  The  City Council. ")).toBe("the city council");
    expect(normalizeText("“pollen”")).toBe("pollen");
    expect(normalizeText("children’s")).toBe("children's");
    expect(normalizeText("colour")).not.toBe(normalizeText("color"));
  });

  it("counts words; hyphenated = one; numbers counted apart", () => {
    expect(countWords("well-known writer")).toEqual({ words: 2, numbers: 0 });
    expect(countWords("15 March")).toEqual({ words: 1, numbers: 1 });
    expect(countWords("")).toEqual({ words: 0, numbers: 0 });
  });

  it("word limits, with and without AND/OR A NUMBER", () => {
    expect(withinWordLimit("flower pollen", { max_words: 2, number_allowed: false })).toBe(true);
    expect(withinWordLimit("fresh flower pollen", { max_words: 2, number_allowed: false })).toBe(false);
    expect(withinWordLimit("15 March", { max_words: 1, number_allowed: false })).toBe(false);
    expect(withinWordLimit("15 March", { max_words: 1, number_allowed: true })).toBe(true);
    expect(withinWordLimit("15 20", { max_words: 1, number_allowed: true })).toBe(false);
  });
});
