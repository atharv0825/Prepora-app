import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseReadingQuestion } from "@prepora/shared/ielts/reading";
import { contentFromDraft } from "./reading-builder";
import {
  acceptedAnswers,
  draftFromImported,
  judgementLabel,
  judgementValue,
  normalizeGaps,
  parseReadingDraft,
  rulesFromInstructions,
  type ImportResult,
} from "./reading-import";

const SAMPLE = readFileSync(new URL("./fixtures/reading-import-sample.md", import.meta.url), "utf8");
const parsed = parseReadingDraft(SAMPLE, { testType: "academic" });
const q = (r: ImportResult, n: number) => r.questions.find((x) => x.number === n)!;
/** What would be saved for question n: the builder's own conversion, then the shared contract. */
const saved = (r: ImportResult, n: number) => contentFromDraft(draftFromImported(q(r, n)));
const kinds = (r: ImportResult) => r.warnings.map((w) => w.kind);

describe("the sample draft (3 passages, 40 questions, 11 types)", () => {
  it("finds the 3 passages with titles, paragraph letters and word counts", () => {
    expect(parsed.passages.map((p) => [p.order_no, p.title, p.paragraphCount, p.letters.join("")])).toEqual([
      [1, "The Glassmakers of Murano", 4, "ABCD"],
      [2, "Sleep and the Teenage Brain", 5, "ABCDE"],
      [3, "Urban Beekeeping", 4, "ABCD"],
    ]);
    // Letters stay at the start of their paragraphs ("A  …"), bold markers ("**A.**") or not.
    expect(parsed.passages[1]!.body.split("\n\n")[0]).toMatch(/^A {2}It is a familiar complaint/);
    expect(parsed.passages[0]!.wordCount).toBeGreaterThan(200);
  });

  it("finds all 40 questions, numbered 1–40, across the 11 types", () => {
    expect(parsed.questions.map((x) => x.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    const byType = Object.fromEntries(
      [...new Set(parsed.questions.map((x) => x.q_type))].map((t) => [t, parsed.questions.filter((x) => x.q_type === t).length]),
    );
    expect(byType).toEqual({
      mcq: 4,
      tfng: 5,
      sentence_completion: 4,
      matching_headings: 5,
      matching_information: 4,
      matching_features: 4,
      ynng: 4,
      summary_completion: 3,
      flowchart_completion: 3,
      note_table_completion: 2,
      short_answer: 2,
    });
    expect(parsed.questions.filter((x) => x.passage === 2).map((x) => x.number)).toEqual(Array.from({ length: 13 }, (_, i) => i + 14));
  });

  it("every question converts to content that passes the shared contract", () => {
    for (const x of parsed.questions) {
      const result = parseReadingQuestion(contentFromDraft(draftFromImported(x)));
      expect(result.success, `question ${x.number}: ${result.error?.issues[0]?.message}`).toBe(true);
    }
  });

  it("warns only about the picture question and the builder notes", () => {
    expect(parsed.warnings.map((w) => [w.kind, w.number])).toEqual([
      ["needs_image", 38],
      ["builder_note", undefined],
      ["builder_note", undefined],
    ]);
    expect(parsed.notes).toEqual(["Question 38 needs the honeycomb diagram from the designer.", 'Check the spelling of "Okafor" with the author.']);
    expect(q(parsed, 38).needs_image).toBe(true);
  });

  it("MCQ: the lettered choices under each question and a letter answer", () => {
    expect(q(parsed, 1).choices).toEqual(["to reduce the cost of fuel", "to protect Venice from fire", "to be closer to supplies of sand", "to separate rival families"]);
    expect(saved(parsed, 1)).toMatchObject({ q_type: "mcq", options: { select: 1 }, answer: { labels: ["B"] } });
    expect(saved(parsed, 3)).toMatchObject({ answer: { labels: ["A"] } });
    expect(q(parsed, 1).explanation).toContain("danger of fire");
  });

  it("TFNG and YNNG: stored as the builder stores them, shown as True / False / Not Given", () => {
    expect([5, 6, 8].map((n) => (saved(parsed, n).answer as { value: string }).value)).toEqual(["true", "not_given", "false"]);
    expect(saved(parsed, 27)).toMatchObject({ q_type: "ynng", answer: { value: "no" } });
    expect(saved(parsed, 29)).toMatchObject({ q_type: "ynng", answer: { value: "not_given" } });
    expect(["true", "false", "not_given", "yes"].map(judgementLabel)).toEqual(["True", "False", "Not Given", "Yes"]);
  });

  it("matching headings: the whole list, extra headings included, and a numeral answer", () => {
    const c = saved(parsed, 15);
    expect((c.options as { headings: string[] }).headings).toHaveLength(7); // 5 paragraphs, 2 extra headings
    expect(c).toMatchObject({ prompt: "Paragraph B", answer: { label: "iv" } });
    expect(saved(parsed, 18)).toMatchObject({ answer: { label: "iii" } });
  });

  it("matching information and features: paragraph letters from the instructions, the list of researchers", () => {
    expect(saved(parsed, 19)).toMatchObject({ options: { paragraphs: ["A", "B", "C", "D", "E"], reuse: true }, answer: { label: "B" } });
    expect(saved(parsed, 23)).toMatchObject({ options: { features: ["Ana Reyes", "Lee Hart", "Sam Okafor"] }, answer: { label: "C" } });
  });

  it("flow-chart completion: the gap, the word limit and 'and/or a number'", () => {
    expect(saved(parsed, 34)).toEqual({
      q_type: "flowchart_completion",
      prompt: "Foragers store nectar in a special ___.",
      options: { max_words: 2, number_allowed: true },
      answer: { accept: ["stomach"] },
    });
  });

  it("summary from a word list given after the questions; sentence and note gaps; short answers with optional words", () => {
    expect(saved(parsed, 32)).toMatchObject({ options: { word_bank: ["nectar", "bare", "travel", "water", "sugar", "full"] }, answer: { label: "B" } });
    expect(saved(parsed, 10)).toEqual({
      q_type: "sentence_completion",
      prompt: "Clear glass was made by purifying the ash of ___",
      options: { max_words: 2, number_allowed: false },
      answer: { accept: ["coastal plants"] },
    });
    expect(saved(parsed, 37)).toMatchObject({ q_type: "note_table_completion", options: { max_words: 1 } });
    expect(saved(parsed, 39)).toMatchObject({ q_type: "short_answer", options: { max_words: 3 }, answer: { accept: ["their own honey", "honey"] } });
  });
});

describe("problems become warnings", () => {
  it("missing answers: warned, and the question can't be saved until one is added", () => {
    const r = parseReadingDraft(SAMPLE.replace("| 2 | C |", "| 99 | C |").replace(/^\| 34 \| stomach \| \|$/m, ""));
    expect(r.warnings.filter((w) => w.kind === "missing_answer").map((w) => w.number)).toEqual([2, 34]);
    expect(r.warnings.find((w) => w.kind === "unmatched_answer")?.number).toBe(99);
    expect(parseReadingQuestion(saved(r, 2)).success).toBe(false);
    expect(parseReadingQuestion(saved(r, 34)).success).toBe(false);
    // Adding the answer in the preview makes it valid.
    expect(parseReadingQuestion(contentFromDraft(draftFromImported({ ...q(r, 34), answer: "stomach" }))).success).toBe(true);
  });

  it("skipped and duplicate numbers, a wrong-sized group, answers in the wrong form", () => {
    const r = parseReadingDraft(
      ["Passage 1: T", "A. a", "B. b", "C. c", "D. d", "Questions 1–4", "Write TRUE, FALSE or NOT GIVEN.", "1. One.", "2. Two.", "2. Again.", "5. Five.",
        "Answer key", "1 | TRUE", "2 | maybe", "5 | FALSE"].join("\n"),
    );
    expect(kinds(r)).toEqual(expect.arrayContaining(["duplicate", "numbering", "group_count", "answer_format"]));
    expect(r.warnings.find((w) => w.kind === "numbering")?.message).toBe("Question numbers skip from 2 to 5.");
    expect(r.warnings.find((w) => w.kind === "answer_format")?.message).toContain('"maybe" isn\'t True, False or Not Given');
  });

  it("unknown instructions, choices without a question, short Academic passages", () => {
    const text = ["Passage 1: Short", "A. One paragraph only.", "Questions 1–2", "Think about these.", "1. First?", "2. Second?",
      "Questions 3–3", "Choose the correct letter, A, B or C.", "A. stray choice", "3. Third?", "A. yes", "B. no"].join("\n");
    const r = parseReadingDraft(text, { testType: "academic" });
    expect(kinds(r)).toEqual(expect.arrayContaining(["unknown_type", "orphan_choices", "short_passage", "missing_answer"]));
    expect(q(r, 1).q_type).toBeNull();
    expect(q(r, 3).choices).toEqual(["yes", "no"]);
    // General Training passages aren't held to 4 paragraphs.
    expect(kinds(parseReadingDraft(text, { testType: "general" }))).not.toContain("short_passage");
  });

  it("builder notes are never imported as content", () => {
    expect(parsed.passages.every((p) => !p.body.includes("honeycomb diagram"))).toBe(true);
    expect(parsed.questions.every((x) => !x.prompt.includes("Okafor") || x.number === 23 || x.list.length)).toBe(true);
  });
});

describe("other draft shapes", () => {
  it("one passage pasted without its heading, plain letters, an answer key as '1. B' lines", () => {
    const r = parseReadingDraft(["A) First.", "B) Second.", "C) Third.", "D) Fourth.", "", "Question 1", "Which paragraph contains the following information?",
      "1. a fourth thing", "", "Answers", "1. D"].join("\n"));
    expect(r.passages).toHaveLength(1);
    expect(r.passages[0]).toMatchObject({ order_no: 1, title: "Passage 1", letters: ["A", "B", "C", "D"] });
    expect(saved(r, 1)).toMatchObject({ q_type: "matching_information", options: { paragraphs: ["A", "B", "C", "D"] }, answer: { label: "D" } });
  });

  it("an answer key from a Word table: one cell per line", () => {
    const r = parseReadingDraft(["Passage 1: T", "A. a", "B. b", "C. c", "D. d", "Questions 1–2", "Write TRUE, FALSE or NOT GIVEN.", "1. One.", "2. Two.",
      "Answer key", "Q", "Answer", "1", "TRUE", "2", "NOT GIVEN"].join("\n\n"));
    expect(r.questions.map((x) => x.answer)).toEqual(["TRUE", "NOT GIVEN"]);
    expect(kinds(r)).not.toContain("missing_answer");
  });

  it("'Reading Passage 2 has five paragraphs' is an instruction, not a new passage", () => {
    expect(parsed.passages).toHaveLength(3);
  });

  it("no word limit in the instructions: 2 words, with a warning", () => {
    const r = parseReadingDraft(["Passage 1: T", "A. a", "B. b", "C. c", "D. d", "Questions 1–1", "Complete the sentences below.", "1. It is ____.", "Answer key", "1 | red"].join("\n"));
    expect(kinds(r)).toContain("word_limit");
    expect(saved(r, 1)).toMatchObject({ options: { max_words: 2 } });
  });
});

describe("helpers", () => {
  it("normalizeGaps: dots, ellipses, underscores and [gap] become ___", () => {
    expect(normalizeGaps("It is made in ........ .")).toBe("It is made in ___");
    expect(normalizeGaps("A … B")).toBe("A ___ B");
    expect(normalizeGaps("x [gap] y")).toBe("x ___ y");
    expect(normalizeGaps("an ordinary sentence... yes")).toBe("an ordinary sentence... yes");
  });
  it("acceptedAnswers: / and OR separate alternatives; ( ) marks optional words", () => {
    expect(acceptedAnswers("coastal plants")).toEqual(["coastal plants"]);
    expect(acceptedAnswers("(the) museum OR gallery")).toEqual(["the museum", "museum", "gallery"]);
  });
  it("judgementValue: TRUE / T / NG / YES …", () => {
    expect(["TRUE", "t", "Not given", "NG", "False"].map((v) => judgementValue(v, "tfng"))).toEqual(["true", "true", "not_given", "not_given", "false"]);
    expect(judgementValue("YES", "tfng")).toBeNull();
    expect(judgementValue("y", "ynng")).toBe("yes");
  });
  it("rulesFromInstructions: word limits and numbers", () => {
    expect(rulesFromInstructions("Write ONE WORD AND/OR A NUMBER for each answer.", false, false)).toMatchObject({ max_words: 1, number_allowed: true });
    expect(rulesFromInstructions("NO MORE THAN THREE WORDS AND/OR A NUMBER", false, false)).toMatchObject({ max_words: 3, number_allowed: true });
    expect(rulesFromInstructions("Write ONE WORD ONLY", false, false)).toMatchObject({ max_words: 1 });
    expect(rulesFromInstructions("Choose TWO letters, A–E.", false, false)).toMatchObject({ q_type: "mcq", select: 2 });
  });
});
