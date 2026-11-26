import { describe, expect, it } from "vitest";
import { OcrWritingRequest, OcrWritingResponse, joinOcrPages } from "./ocr-writing";
import {
  ScoredWriting,
  ScoreWritingRequest,
  ScoreWritingResponse,
  toWritingSummary,
  WritingFeedback,
  writingFeedbackFor,
} from "./score-writing";

const TASK = "6d000000-0000-4000-8000-000000000003";
const USER = "6c000000-0000-4000-8000-000000000002";

const scored: ScoredWriting = {
  scores: { ta: 7, cc: 6.5, lr: 6.5, gra: 6 },
  summary: "Clear position, some grammar slips.",
  corrections: [
    { original: "alot", suggestion: "a lot", category: "spelling", explanation: "Two words." },
    { original: "peoples", suggestion: "people", category: "grammar", explanation: "Already plural." },
  ],
  strengths: ["Clear position."],
  improvements: ["Check agreement."],
  model_answer: "Remote working has become widespread…",
};

const base = {
  submission_id: "5b000000-0000-4000-8000-000000000001",
  task_id: TASK,
  task_no: 2,
  word_count: 262,
  min_words: 250,
  scores: scored.scores,
  band: 6.5,
  credits_charged: 4,
  balance_after: 96,
};

describe("ScoreWritingRequest", () => {
  it("takes a typed answer (input_mode defaults to typed)", () => {
    expect(ScoreWritingRequest.parse({ task_id: TASK, text: "My essay." })).toEqual({ task_id: TASK, text: "My essay.", input_mode: "typed" });
  });

  it("takes a photo answer with 1–2 paths in the student's folder", () => {
    const ok = { task_id: TASK, text: "Read text", input_mode: "photo", photo_paths: [`${USER}/p1.jpg`, `${USER}/p2.heic`] };
    expect(ScoreWritingRequest.safeParse(ok).success).toBe(true);
    expect(ScoreWritingRequest.safeParse({ ...ok, photo_paths: [] }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ ...ok, photo_paths: [`${USER}/1.jpg`, `${USER}/2.jpg`, `${USER}/3.jpg`] }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ ...ok, photo_paths: ["../etc/passwd"] }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ ...ok, photo_paths: [`${USER}/a/b.jpg`] }).success).toBe(false);
  });

  it("requires photos exactly for photo answers", () => {
    expect(ScoreWritingRequest.safeParse({ task_id: TASK, text: "x", input_mode: "photo" }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ task_id: TASK, text: "x", photo_paths: [`${USER}/p.jpg`] }).success).toBe(false);
  });

  it("refuses empty, oversized or unknown input", () => {
    expect(ScoreWritingRequest.safeParse({ task_id: TASK, text: "  \n " }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ task_id: TASK, text: "a".repeat(20_001) }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ task_id: "nope", text: "x" }).success).toBe(false);
    expect(ScoreWritingRequest.safeParse({ task_id: TASK, text: "x", band: 9 }).success).toBe(false);
  });
});

describe("ScoredWriting (the model's output)", () => {
  it("accepts full feedback and refuses off-scale or missing parts", () => {
    expect(ScoredWriting.safeParse(scored).success).toBe(true);
    expect(ScoredWriting.safeParse({ ...scored, scores: { ...scored.scores, gra: 6.3 } }).success).toBe(false);
    expect(ScoredWriting.safeParse({ ...scored, scores: { ta: 7, cc: 7, lr: 7 } }).success).toBe(false);
    expect(ScoredWriting.safeParse({ ...scored, strengths: [] }).success).toBe(false);
    expect(ScoredWriting.safeParse({ ...scored, model_answer: "" }).success).toBe(false);
    const badCategory = { ...scored, corrections: [{ ...scored.corrections[0], category: "tone" }] };
    expect(ScoredWriting.safeParse(badCategory).success).toBe(false);
  });
});

describe("ScoreWritingResponse", () => {
  it("full (Gold/Platinum) and summary (Free) shapes", () => {
    const full = { ...base, ...writingFeedbackFor(scored, true) };
    const summary = { ...base, ...writingFeedbackFor(scored, false) };
    expect(ScoreWritingResponse.parse(full).detail).toBe("full");
    expect(ScoreWritingResponse.parse(summary)).toEqual({ ...base, detail: "summary", summary: scored.summary, corrections_count: 2 });
  });

  it("the summary shape can't carry the paid parts", () => {
    const leaky = { ...base, ...toWritingSummary(scored), corrections: scored.corrections };
    expect(ScoreWritingResponse.safeParse(leaky).success).toBe(false);
    const leakyModel = { ...base, ...toWritingSummary(scored), model_answer: "x" };
    expect(ScoreWritingResponse.safeParse(leakyModel).success).toBe(false);
  });

  it("the band must follow from the criteria", () => {
    const full = { ...base, ...writingFeedbackFor(scored, true) };
    expect(ScoreWritingResponse.safeParse({ ...full, band: 7 }).success).toBe(false);
  });

  it("stored feedback (writing_submissions.feedback) uses the same two shapes", () => {
    expect(WritingFeedback.parse(writingFeedbackFor(scored, true))).not.toHaveProperty("scores");
    expect(WritingFeedback.parse(writingFeedbackFor(scored, false))).toEqual({
      detail: "summary",
      summary: scored.summary,
      corrections_count: 2,
    });
  });
});

describe("ocr-writing", () => {
  it("request: 1–2 distinct photos in the student's folder", () => {
    expect(OcrWritingRequest.safeParse({ photo_paths: [`${USER}/p1.jpg`] }).success).toBe(true);
    expect(OcrWritingRequest.safeParse({ photo_paths: [`${USER}/p1.jpg`], task_id: TASK }).success).toBe(true);
    expect(OcrWritingRequest.safeParse({ photo_paths: [] }).success).toBe(false);
    expect(OcrWritingRequest.safeParse({ photo_paths: [`${USER}/p1.jpg`, `${USER}/p1.jpg`] }).success).toBe(false);
    expect(OcrWritingRequest.safeParse({ photo_paths: ["p1.jpg"] }).success).toBe(false);
  });

  it("response: text is the pages joined with a blank line", () => {
    const pages = [
      { path: `${USER}/p1.jpg`, text: " First page. \n", legibility: "good" as const },
      { path: `${USER}/p2.jpg`, text: "Second [?] page.", legibility: "partial" as const },
    ];
    expect(joinOcrPages(pages)).toBe("First page.\n\nSecond [?] page.");
    const ok = { text: joinOcrPages(pages), word_count: 4, pages, credits_charged: 1, balance_after: 9 };
    expect(OcrWritingResponse.safeParse(ok).success).toBe(true);
    expect(OcrWritingResponse.safeParse({ ...ok, text: "Something else" }).success).toBe(false);
    expect(joinOcrPages([{ text: "" }, { text: "Only this" }])).toBe("Only this");
  });
});
