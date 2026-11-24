import { describe, expect, it } from "vitest";
import { ListeningGradeRequest, ListeningGradeResponse, ListeningTestPayload } from "./listening-test";

const id = "00000000-0000-4000-8000-000000000001";
const payload = {
  test: { id, title: "T", min_plan: "free", status: "published" },
  sections: [{ id, order_no: 1, title: "Part 1", audio_url: "https://cdn.example.com/1.mp3", duration_sec: 300 }],
  questions: [{ id, section_id: id, q_no: 1, q_type: "map_labelling", prompt: "Café", options: {} }],
};

describe("Listening test payload", () => {
  it("parses a test without answers or transcripts", () => {
    expect(ListeningTestPayload.parse(payload).sections[0]?.order_no).toBe(1);
  });

  it("refuses answers, explanations and transcripts before submission", () => {
    for (const extra of [{ answer: { label: "A" } }, { explanation: "x" }]) {
      const leaked = { ...payload, questions: [{ ...payload.questions[0], ...extra }] };
      expect(ListeningTestPayload.safeParse(leaked).success).toBe(false);
    }
    const transcript = { ...payload, sections: [{ ...payload.sections[0], transcript: "Good morning…" }] };
    expect(ListeningTestPayload.safeParse(transcript).success).toBe(false);
  });

  it("grading: needs a mode; refuses sent-in scores; the response has transcripts", () => {
    const req = { module: "listening", test_id: id, mode: "exam", answers: { "1": "B" } };
    expect(ListeningGradeRequest.safeParse(req).success).toBe(true);
    expect(ListeningGradeRequest.safeParse({ ...req, mode: undefined }).success).toBe(false);
    expect(ListeningGradeRequest.safeParse({ ...req, band: 9 }).success).toBe(false);
    const res = {
      attempt_id: id,
      module: "listening",
      test_id: id,
      mode: "exam",
      raw_score: 1,
      total: 1,
      band: 9,
      results: [{ q_no: 1, q_type: "map_labelling", correct: true, given: "B", correct_answer: "B", explanation: null }],
      transcripts: [{ order_no: 1, title: "Part 1", transcript: "Good morning…" }],
      allowance: { type: "listening_tests", used: 1, limit: 2 },
    };
    expect(ListeningGradeResponse.parse(res).transcripts[0]?.transcript).toBe("Good morning…");
  });
});
