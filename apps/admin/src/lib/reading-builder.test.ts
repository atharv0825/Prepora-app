import { describe, expect, it } from "vitest";
import { parseReadingQuestion, type ReadingQuestionType, readingQuestionTypes } from "@prepora/shared/ielts/reading";
import { compactList, contentFromDraft, draftFromQuestion, emptyDraft, fieldErrors, paragraphLetters, type QuestionDraft } from "./reading-builder";

/** A filled-in form for each type, as an editor would leave it. */
function filled(t: ReadingQuestionType): QuestionDraft {
  const d = emptyDraft(t);
  d.prompt = ["sentence_completion", "summary_completion", "note_table_completion", "flowchart_completion"].includes(t)
    ? "Bees were first kept on ___ roofs."
    : "Which is true?";
  d.explanation = "Paragraph B.";
  switch (t) {
    case "mcq":
      return { ...d, choices: ["one", "two", "three", ""], select: 2, correct: ["C", "A"] };
    case "tfng":
      return { ...d, value: "not_given" };
    case "ynng":
      return { ...d, value: "no" };
    case "matching_headings":
      return { ...d, list: ["Origins", "Costs", "Future"], label: "iii" };
    case "matching_features":
      return { ...d, list: ["Smith", "Jones"], label: "B", reuse: false };
    case "matching_information":
      return { ...d, paragraphs: "a, b c", label: "C" };
    case "summary_completion":
      return { ...d, bank: true, list: ["hotel", "", "office"], label: "C" };
    default:
      return { ...d, max_words: 2, number_allowed: true, accept: ["hotel", " ", "hotel's"] };
  }
}

describe("question form (M4-A1)", () => {
  it("every type's filled form makes valid content, and reads back the same", () => {
    for (const t of readingQuestionTypes) {
      const content = contentFromDraft(filled(t));
      const parsed = parseReadingQuestion(content);
      expect(parsed.success, `${t}: ${parsed.error?.issues[0]?.message}`).toBe(true);
      const again = contentFromDraft(draftFromQuestion({ ...content, options: content.options, explanation: "Paragraph B." }));
      expect(again, t).toEqual(content);
    }
  });

  it("drops empty rows and relabels the answer to match", () => {
    expect(contentFromDraft(filled("mcq"))).toMatchObject({ options: { choices: ["one", "two", "three"], select: 2 }, answer: { labels: ["A", "C"] } });
    // Word bank "hotel, (empty), office" with the answer C ("office") → B.
    expect(contentFromDraft(filled("summary_completion"))).toMatchObject({ options: { word_bank: ["hotel", "office"] }, answer: { label: "B" } });
    expect(compactList(["a", "", "c"], (i) => String(i), ["1"]).labels).toEqual([""]); // pointed at the empty row
    expect(contentFromDraft(filled("short_answer"))).toMatchObject({ answer: { accept: ["hotel", "hotel's"] } });
    expect(contentFromDraft(filled("matching_information"))).toMatchObject({ options: { paragraphs: ["A", "B", "C"], reuse: true } });
  });

  it("the next question of a group starts with the previous one's list and limits", () => {
    const prev = filled("matching_headings");
    expect(emptyDraft("matching_headings", prev)).toMatchObject({ list: ["Origins", "Costs", "Future"], prompt: "", label: "" });
    expect(emptyDraft("short_answer", { ...filled("short_answer"), max_words: 3 })).toMatchObject({ max_words: 3, accept: [""] });
    expect(emptyDraft("tfng", prev).list).toEqual(["", "", ""]); // another type: nothing carried
  });

  it("paragraph letters however they're typed", () => {
    expect(paragraphLetters("A B C")).toEqual(["A", "B", "C"]);
    expect(paragraphLetters("a,b, c, c")).toEqual(["A", "B", "C"]);
    expect(paragraphLetters("ABCDEF")).toHaveLength(6);
  });

  it("contract problems land on the right field", () => {
    expect(
      fieldErrors([
        { path: ["prompt"], message: "gap" },
        { path: ["options", "choices", 2], message: "empty" },
        { path: ["options", "max_words"], message: "limit" },
        { path: ["answer", "labels"], message: "letters" },
        { path: ["answer", "accept", 0], message: "later" },
      ]),
    ).toEqual({ prompt: "gap", list: "empty", answer: "limit" });
  });
});
