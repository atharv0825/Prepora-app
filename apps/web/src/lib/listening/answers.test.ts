import { describe, expect, it } from "vitest";
import { ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { LabellingQuestionContent } from "@prepora/shared/ielts/listening";
import { parseReadingQuestion } from "@prepora/shared/ielts/reading";
import {
  answeredCount,
  displayAnswer,
  isTyped,
  limitText,
  overWordLimit,
  parseDraft,
  questionsBySection,
  sectionScores,
  setAnswer,
  sheetBlocks,
  toGradeAnswers,
} from "./answers";
import { SAMPLE_SECTION_COUNT, sampleKeys, samplePayload, sampleSeconds, sampleTranscripts } from "./sample";
import { parseRange, sampleWav } from "./sample-audio";
import { gradeSample } from "./sample-grade";

const sample = samplePayload(20);
const byNo = (n: number) => sample.questions.find((q) => q.q_no === n)!;

describe("answer sheet (M5-F2)", () => {
  it("sets and clears answers; sends trimmed, non-empty ones", () => {
    let a = setAnswer({}, 1, "  Hillside ");
    a = setAnswer(a, 20, ["A", "D"]);
    a = setAnswer(a, 3, "x");
    a = setAnswer(a, 3, "   ");
    expect(a).toEqual({ "1": "  Hillside ", "20": ["A", "D"] });
    expect(toGradeAnswers({ ...a, "5": " ", "6": [] })).toEqual({ "1": "Hillside", "20": ["A", "D"] });
    expect(answeredCount(a, [1, 2, 3, 20])).toBe(2);
  });

  it("splits 40 questions into 4 sections of 10", () => {
    const sections = questionsBySection(sample.questions);
    expect([...sections.values()].map((s) => s.length)).toEqual([10, 10, 10, 10]);
    expect(sections.get(3)![0]!.q_no).toBe(21);
  });

  it("groups labelling questions on the same image into one block", () => {
    const part2 = questionsBySection(sample.questions).get(2)!;
    const blocks = sheetBlocks(part2);
    expect(blocks[0]).toMatchObject({ kind: "labelling" });
    expect(blocks[0]!.kind === "labelling" && blocks[0]!.questions.map((q) => q.q_no)).toEqual([11, 12, 13, 14, 15]);
    expect(blocks.slice(1).every((b) => b.kind === "question")).toBe(true);
    // Two different images → two blocks.
    const other = { ...byNo(12), options: { ...byNo(12).options, image_url: "https://cdn.example.com/other.png" } };
    expect(sheetBlocks([byNo(11), other]).length).toBe(2);
  });

  it("knows which questions are typed, and warns over the word limit", () => {
    expect(isTyped(byNo(1))).toBe(true);
    expect(isTyped(byNo(11))).toBe(false); // map: a letter
    expect(isTyped(byNo(31))).toBe(true); // diagram: typed
    expect(isTyped({ q_type: "diagram_labelling", options: { word_bank: ["a", "b"] } })).toBe(false);
    expect(isTyped(byNo(16))).toBe(false);
    expect(overWordLimit(byNo(37), "very slowly")).toBe(true);
    expect(overWordLimit(byNo(37), "slowly")).toBe(false);
    expect(overWordLimit(byNo(38), "2 months")).toBe(false);
    expect(overWordLimit(byNo(16), ["A"])).toBe(false);
    expect(limitText(byNo(1).options)).toBe("ONE WORD AND/OR A NUMBER");
    expect(limitText(byNo(37).options)).toBe("ONE WORD ONLY");
    expect(limitText(byNo(38).options)).toBe("NO MORE THAN TWO WORDS AND/OR A NUMBER");
    expect(limitText({ max_words: 3 })).toBe("NO MORE THAN THREE WORDS");
    expect(limitText(byNo(16).options)).toBeNull();
  });

  it("restores a saved draft, ignoring anything malformed", () => {
    expect(parseDraft('{"1":"Hillside","20":["A","D"],"41":"x","2":5,"3":["A","B","C","D"]}')).toEqual({ "1": "Hillside", "20": ["A", "D"] });
    expect(parseDraft("not json")).toEqual({});
    expect(parseDraft("[1]")).toEqual({});
    expect(parseDraft(null)).toEqual({});
  });
});

describe("results (M5-F3)", () => {
  it("scores each section and shows answers readably", () => {
    const results = [
      { q_no: 1, correct: true },
      { q_no: 2, correct: false },
      { q_no: 11, correct: true },
    ];
    expect(sectionScores(results)).toEqual([
      { section: 1, correct: 1, total: 2 },
      { section: 2, correct: 1, total: 1 },
    ]);
    expect(displayAnswer(null)).toBe("—");
    expect(displayAnswer(["A", "D"])).toBe("A, D");
    expect(displayAnswer("not_given")).toBe("not given");
  });
});

describe("the sample test (stand-in until M5-C1/B2)", () => {
  it("matches the contract and sends no answers or transcripts to the browser", () => {
    expect(ListeningTestPayload.safeParse({ ...sample, sections: sample.sections.map((s) => ({ ...s, audio_url: `https://x.test${s.audio_url}` })) }).success).toBe(true);
    const json = JSON.stringify(sample);
    for (const leak of ['"answer"', '"explanation"', '"accept"', '"transcript"', "Hillside Walking Club"]) expect(json).not.toContain(leak);
    expect(sample.sections).toHaveLength(SAMPLE_SECTION_COUNT);
  });

  it("every key is valid for its type (Reading rules, or the labelling shape)", () => {
    for (const k of sampleKeys()) {
      const prompt = sample.questions.find((q) => q.q_no === k.q_no)!.prompt;
      const content = { q_type: k.q_type, prompt, options: k.options, answer: k.answer };
      const parsed = k.q_type.endsWith("_labelling")
        ? LabellingQuestionContent.safeParse({ ...content, options: { ...k.options, image_url: "https://cdn.example.com/i.svg" } })
        : parseReadingQuestion(content);
      expect(parsed.success, `Q${k.q_no}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("grades with grade-test's rules: all right → 9; labelling and typed answers marked", () => {
    const right: Record<string, string | string[]> = {};
    for (const k of sampleKeys()) {
      const a = k.answer as { label?: string; labels?: string[]; accept?: string[] };
      right[String(k.q_no)] = a.labels ?? a.label ?? a.accept![0]!;
    }
    const all = gradeSample("exam", right);
    expect(all).toMatchObject({ mode: "exam", raw_score: 40, total: 40, band: 9 });
    expect(all.transcripts).toEqual(sampleTranscripts());

    const some = gradeSample("practice", { ...right, "11": "D", "31": "Screen.", "37": "very slowly", "20": ["D", "A"] });
    const r = (n: number) => some.results.find((x) => x.q_no === n)!;
    expect(r(11)).toMatchObject({ q_type: "map_labelling", correct: false, correct_answer: "C" });
    expect(r(31)).toMatchObject({ q_type: "diagram_labelling", correct: true });
    expect(r(37)).toMatchObject({ correct: false, note: "over_word_limit" });
    expect(r(20).correct).toBe(true);
    expect(some).toMatchObject({ raw_score: 38, band: 8.5 });
    expect(gradeSample("exam", {})).toMatchObject({ raw_score: 0, band: 0 });
  });

  it("audio: a valid WAV of the requested length; ranges for seeking", () => {
    const wav = sampleWav(2, 3);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wav.length).toBe(44 + 8000 * 3);
    expect(parseRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=1000-", 1000)).toBeNull();
    expect(parseRange("items=0-1", 1000)).toBeNull();
    expect(sampleSeconds("3")).toBe(3);
    expect(sampleSeconds(undefined)).toBe(20);
    expect(sampleSeconds("9999")).toBe(20);
  });
});

