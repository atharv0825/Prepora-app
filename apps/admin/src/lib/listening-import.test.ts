// Listening "Import questions": the Reading import's parser in Listening mode (one parser), on a
// form-completion + MCQ + map-labelling sample, a matching + diagram + notes sample, and the
// Reading sample, checked with the same conversion and contract as the builder's preview.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkImported, parseReadingDraft, rulesFromInstructions } from "./reading-import";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const SAMPLE_1 = fixture("listening-import-sample.txt");
const SAMPLE_2 = fixture("listening-import-sample-2.txt");
const READING = fixture("reading-import-sample.txt");

const listening = (text: string) => parseReadingDraft(text, { module: "listening" });
const byNumber = (r: ReturnType<typeof listening>) => new Map(r.questions.map((q) => [q.number, q]));

describe("Listening instructions → type", () => {
  const rules = (text: string, letterList = false) => rulesFromInstructions(text, false, letterList, "listening").q_type;
  it("maps the 9 Listening task types", () => {
    expect(rules("Choose the correct letter, A, B or C.")).toBe("mcq");
    expect(rules("What does the speaker say about each place? Write the correct letter, A–E, next to Questions 11–14.", true)).toBe("matching_features");
    expect(rules("Label the plan below. Write the correct letter, A–H, next to Questions 11–15.")).toBe("map_labelling");
    expect(rules("Label the map below. Write NO MORE THAN TWO WORDS for each answer.")).toBe("diagram_labelling");
    expect(rules("Label the diagram below. Choose THREE answers from the box and write the correct letter, A–E.", true)).toBe("diagram_labelling");
    expect(rules("Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.")).toBe("note_table_completion");
    expect(rules("Complete the notes below. Write NO MORE THAN TWO WORDS for each answer.")).toBe("note_table_completion");
    expect(rules("Complete the table below.")).toBe("note_table_completion");
    expect(rules("Complete the flow-chart below.")).toBe("flowchart_completion");
    expect(rules("Complete the sentences below.")).toBe("sentence_completion");
    expect(rules("Answer the questions below. Write NO MORE THAN THREE WORDS.")).toBe("short_answer");
  });

  it("Reading keeps its own rules (no Listening types)", () => {
    expect(rulesFromInstructions("Label the diagram below.", false, false).q_type).toBe("note_table_completion");
    expect(rulesFromInstructions("Complete the form below.", false, false).q_type).toBeNull();
  });
});

describe("sample 1: form completion, MCQ, map labelling", () => {
  const r = listening(SAMPLE_1);
  const q = byNumber(r);

  it("finds 10 questions and no passages", () => {
    expect(r.passages).toEqual([]);
    expect(r.questions.map((x) => x.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("form completion: numbers in the gaps, several per line, bullets, a table row, sub-headings", () => {
    expect(q.get(1)).toMatchObject({ q_type: "note_table_completion", prompt: "Address: ___ Road, Bristol", max_words: 1, number_allowed: true, answer: "Hill" });
    expect(q.get(2)!.prompt).toBe("Town: ___");
    expect(q.get(3)!.prompt).toBe("Length of stay: from ___ to (4) June");
    expect(q.get(4)!.prompt).toBe("Length of stay: from (3) to ___ June");
    expect(q.get(5)!.prompt).toBe("Room details – Type of room: ___");
    expect(q.get(6)!.prompt).toBe("Room details – Breakfast | £12 per day | served in the ___");
    // The example line is never a question.
    expect(r.questions.some((x) => /Sarah Jones/.test(x.prompt))).toBe(false);
  });

  it("MCQ with choices written without a dot after the letter", () => {
    expect(q.get(7)).toMatchObject({ q_type: "mcq", prompt: "Why does Sarah choose this hotel?", answer: "B" });
    expect(q.get(7)!.choices).toEqual(["It is close to the station.", "A friend recommended it.", "It has a swimming pool."]);
    expect(q.get(8)!.choices).toEqual(["visit a museum", "go to a concert", "meet a colleague"]);
  });

  it("map labelling: the place, its letter, flagged as needing the picture", () => {
    expect(q.get(9)).toMatchObject({ q_type: "map_labelling", prompt: "Car park", answer: "E", needs_image: true });
    expect(q.get(10)).toMatchObject({ q_type: "map_labelling", prompt: "Reception", answer: "C", needs_image: true });
  });

  it("skips the transcript and says so; warns about the picture", () => {
    expect(r.warnings.map((w) => w.kind).sort()).toEqual(["needs_image", "transcript"]);
    expect(r.warnings.find((w) => w.kind === "transcript")!.message).toMatch(/^A transcript \(\d+ words\) was skipped/);
    expect(r.questions.some((x) => /book a room/.test(x.prompt))).toBe(false);
  });

  it("every question passes the builder's contract; map questions are saved without a picture", () => {
    for (const item of r.questions) {
      const c = checkImported(item, "listening");
      expect(c.error, `question ${item.number}`).toBeNull();
    }
    const map = checkImported(q.get(9)!, "listening");
    expect(map).toMatchObject({ needsImage: true, content: { q_type: "map_labelling", prompt: "Car park", options: {}, answer: { label: "E" } } });
    expect(checkImported(q.get(3)!, "listening").content).toMatchObject({
      q_type: "note_table_completion",
      options: { max_words: 1, number_allowed: true },
      answer: { accept: ["14", "14th"] },
    });
  });
});

describe("sample 2: matching, a diagram with a word box, notes, a transcript without a heading", () => {
  const r = listening(SAMPLE_2);
  const q = byNumber(r);

  it("matching: the lettered list, the items without their dots", () => {
    expect(q.get(11)).toMatchObject({ q_type: "matching_features", prompt: "The museum", answer: "A" });
    expect(q.get(11)!.list).toEqual(["It has been rebuilt.", "It is closed on Mondays.", "It is free for children.", "It needs booking in advance.", "It has a new café."]);
  });

  it("diagram labelling from a word box", () => {
    expect(q.get(15)).toMatchObject({ q_type: "diagram_labelling", bank: true, prompt: "Water enters through the ………", answer: "E", needs_image: true });
    expect(q.get(15)!.list).toEqual(["filter", "pump", "tank", "valve", "pipe"]);
    const c = checkImported(q.get(15)!, "listening");
    expect(c.error).toBeNull();
    expect(c.content).toMatchObject({ q_type: "diagram_labelling", prompt: "Water enters through the ___", options: { word_bank: ["filter", "pump", "tank", "valve", "pipe"] }, answer: { label: "E" } });
    expect(c.content!.options).not.toHaveProperty("image_url");
  });

  it("notes keep their sub-headings, the one before the first question included", () => {
    expect(q.get(18)!.prompt).toBe("Visitor centre – Opens at ___ on weekdays");
    expect(q.get(19)!.prompt).toBe("Guided walks – Leave from the ___ every hour");
    expect(q.get(20)!.prompt).toBe("Guided walks – Cost: £ ___");
    expect(q.get(20)!.max_words).toBe(2);
  });

  it("speaker lines among the questions are a transcript: skipped", () => {
    expect(r.questions.map((x) => x.number)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(r.warnings.some((w) => w.kind === "transcript")).toBe(true);
    for (const item of r.questions) expect(checkImported(item, "listening").error, `question ${item.number}`).toBeNull();
  });
});

describe("warnings", () => {
  it("missing answers, unknown types, skipped and duplicate numbers, more than 10", () => {
    const r = listening(`Questions 1–4
Listen and do something.
1 First thing
2 Second thing
4 Fourth thing
4 Fourth again

Answer key
1. A
2. B`);
    const kinds = r.warnings.map((w) => w.kind);
    expect(kinds).toContain("unknown_type");
    expect(kinds).toContain("missing_answer");
    expect(kinds).toContain("duplicate");
    expect(r.warnings.some((w) => w.kind === "group_count" && /missing 3/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => w.kind === "numbering" && /skip from 2 to 4/.test(w.message))).toBe(true);
    expect(checkImported(r.questions[0]!, "listening").error).toBe("Choose the question type.");

    const many = listening(`Questions 1–11\nAnswer the questions below. Write ONE WORD ONLY.\n${Array.from({ length: 11 }, (_, i) => `${i + 1}. Question ${i + 1}?`).join("\n")}`);
    expect(many.warnings.some((w) => w.kind === "too_many" && /a section has 10/.test(w.message))).toBe(true);
  });
});

describe("the Reading sample through the same parser", () => {
  it("Reading mode is unchanged: 3 passages, 40 questions, every one valid", () => {
    const r = parseReadingDraft(READING, { testType: "academic" });
    expect(r.passages).toHaveLength(3);
    expect(r.questions).toHaveLength(40);
    for (const item of r.questions) expect(checkImported(item, "reading").error, `question ${item.number}`).toBeNull();
  });

  it("Listening mode reads its question groups too (no passages; never a Reading-only type)", () => {
    const r = listening(READING);
    expect(r.passages).toEqual([]);
    expect(r.questions.length).toBeGreaterThan(0);
    expect(r.questions.every((x) => x.q_type !== "map_labelling")).toBe(true);
  });
});
