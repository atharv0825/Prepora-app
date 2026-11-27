import { describe, expect, it } from "vitest";
import { ReadingTestPayload } from "./reading-test";

const id = "00000000-0000-4000-8000-000000000001";
const payload = {
  test: { id, test_type: "academic", title: "T", min_plan: "free", status: "published" },
  passages: [{ id, order_no: 1, title: "P", body: "B" }],
  questions: [{ id, passage_id: id, q_no: 1, q_type: "tfng", prompt: "Q", options: {} }],
};

describe("get_reading_test payload (M4-B1)", () => {
  it("parses a test without answers", () => {
    expect(ReadingTestPayload.parse(payload).questions[0]?.q_no).toBe(1);
  });

  it("refuses a question that carries an answer or explanation", () => {
    for (const extra of [{ answer: { value: "true" } }, { explanation: "x" }]) {
      const leaked = { ...payload, questions: [{ ...payload.questions[0], ...extra }] };
      expect(ReadingTestPayload.safeParse(leaked).success).toBe(false);
    }
  });
});
