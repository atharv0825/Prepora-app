import { describe, expect, it } from "vitest";
import { moveQuestion, publishCheck, questionOrder, ReadingPassageInput, ReadingQuestionInput, ReadingTestDetails } from "./admin-reading";

const T = "00000000-0000-4000-8000-000000000001";
const P = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000a3"];
const qid = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;

const passages = P.map((id, i) => ({ id, order_no: i + 1, title: `P${i + 1}`, body: "Text", updated_at: "2026-11-25" }));
const tfng = (n: number, passage: number, extra: Partial<{ answer: unknown; explanation: string | null }> = {}) => ({
  id: qid(n),
  passage_id: P[passage - 1]!,
  q_no: n,
  q_type: "tfng" as const,
  prompt: `Statement ${n}`,
  options: {},
  answer: { value: "true" },
  explanation: "Paragraph A.",
  ...extra,
});

describe("builder inputs (M4-A1)", () => {
  it("test details: a title, a type and a plan", () => {
    expect(ReadingTestDetails.parse({ title: "  Test 3 ", test_type: "general", min_plan: "gold" })).toEqual({
      title: "Test 3",
      test_type: "general",
      min_plan: "gold",
    });
    expect(ReadingTestDetails.safeParse({ title: " ", test_type: "academic", min_plan: "free" }).success).toBe(false);
    expect(ReadingTestDetails.safeParse({ title: "x", test_type: "ielts", min_plan: "free" }).success).toBe(false);
  });

  it("passages are cleaned before the length check", () => {
    const p = ReadingPassageInput.parse({ test_id: T, order_no: "2", title: "Bees", body: "<p>A  Bees.</p>\r\n\r\n\r\nB  Hives." });
    expect(p).toMatchObject({ order_no: 2, body: "A  Bees.\n\nB  Hives." });
    expect(ReadingPassageInput.safeParse({ test_id: T, order_no: 4, title: "x", body: "y" }).success).toBe(false);
    expect(ReadingPassageInput.safeParse({ test_id: T, order_no: 1, title: "x", body: "<br>" }).success).toBe(false);
  });

  it("questions are checked against their type's contract, with defaults filled in", () => {
    const base = { test_id: T, passage_id: P[0], explanation: "  " };
    const mcq = ReadingQuestionInput.parse({ ...base, q_type: "mcq", prompt: "Pick", options: { choices: ["a", "b"] }, answer: { labels: ["B"] } });
    expect(mcq).toMatchObject({ options: { choices: ["a", "b"], select: 1 }, explanation: null });

    const wrong = ReadingQuestionInput.safeParse({ ...base, q_type: "mcq", prompt: "Pick", options: { choices: ["a", "b"] }, answer: { labels: ["C"] } });
    expect(wrong.success).toBe(false);
    expect(wrong.error?.issues[0]?.path).toEqual(["answer", "labels"]);

    const gapless = ReadingQuestionInput.safeParse({
      ...base,
      q_type: "sentence_completion",
      prompt: "No gap here",
      options: { max_words: 2 },
      answer: { accept: ["x"] },
    });
    expect(gapless.error?.issues[0]?.path).toEqual(["prompt"]);
  });
});

describe("numbering (M4-A1)", () => {
  const qs = [tfng(1, 1), tfng(2, 2), tfng(3, 2), { ...tfng(4, 1) }];
  it("orders by passage, then number: a question added to passage 1 comes before passage 2's", () => {
    expect(questionOrder(qs, passages)).toEqual([qid(1), qid(4), qid(2), qid(3)]);
  });

  it("moves within a passage only", () => {
    const ordered = [tfng(1, 1), tfng(2, 1), tfng(3, 2)];
    expect(moveQuestion(ordered, passages, qid(2), "up")).toEqual([qid(2), qid(1), qid(3)]);
    expect(moveQuestion(ordered, passages, qid(2), "down")).toBeNull(); // next is passage 2's
    expect(moveQuestion(ordered, passages, qid(1), "up")).toBeNull();
    expect(moveQuestion(ordered, passages, qid(9), "up")).toBeNull();
  });
});

describe("publish checklist (M4-A1)", () => {
  it("a complete test has nothing blocking; warnings for a short test", () => {
    const check = publishCheck({ passages, questions: [tfng(1, 1), tfng(2, 2), tfng(3, 3)] });
    expect(check.blocking).toEqual([]);
    expect(check.warnings).toEqual(["3 of 40 questions: the band is scaled up from a shorter test."]);
  });

  it("blocks missing passages, gaps, passage order and invalid keys", () => {
    expect(publishCheck({ passages: passages.slice(0, 2), questions: [] }).blocking).toEqual(["Add all 3 passages (2 so far).", "Add questions."]);
    expect(publishCheck({ passages, questions: [tfng(1, 1), tfng(3, 2)] }).blocking).toContain(
      "Question numbers have a gap. Reorder the questions to fix it.",
    );
    expect(publishCheck({ passages, questions: [tfng(1, 2), tfng(2, 1)] }).blocking).toContain(
      "Questions aren't numbered in passage order. Reorder them.",
    );
    expect(publishCheck({ passages, questions: [tfng(1, 1, { answer: { value: "yes" } })] }).blocking).toEqual([
      expect.stringMatching(/^Question 1 \(True \/ False \/ Not Given\): /),
    ]);
  });

  it("warns about passages without questions and missing explanations", () => {
    const { warnings } = publishCheck({ passages, questions: [tfng(1, 1, { explanation: null }), tfng(2, 1, { explanation: " " })] });
    expect(warnings).toContain("Passage 2 has no questions.");
    expect(warnings).toContain("Passage 3 has no questions.");
    expect(warnings).toContain("No explanation for questions 1, 2. Students see one with their results.");
  });
});
