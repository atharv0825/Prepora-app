import { describe, expect, it } from "vitest";
import { ExaminerTurnRequest, ExaminerTurnResponse } from "./examiner-turn";
import { MOCK_PART1_QUESTIONS, mockExaminerTurn } from "../mocks/examiner";
import { MockApiError } from "../mocks/writing";

const S = "7d000000-0000-4000-8000-000000000001";
const T = "7d000000-0000-4000-8000-000000000003";
const U = "7c000000-0000-4000-8000-000000000001";
const rec = (n: number) => `${U}/s-p1-q${n}.webm`;
const answered = (n: number) => Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}?`, transcript: `Answer ${i + 1}.` }));

describe("ExaminerTurnRequest", () => {
  it("the first call has no turns; later ones carry the Q&A, the newest maybe as a recording", () => {
    expect(ExaminerTurnRequest.safeParse({ session_id: S, part: 1, topic_id: T, turns: [] }).success).toBe(true);
    const turns = [...answered(2), { question: "Q3?", audio_path: rec(3), duration_sec: 30 }];
    expect(ExaminerTurnRequest.safeParse({ session_id: S, part: 3, topic_id: T, turns }).success).toBe(true);
  });
  it("refuses Part 2, too many turns, untranscribed older answers, empty answers, other paths", () => {
    const base = { session_id: S, topic_id: T };
    expect(ExaminerTurnRequest.safeParse({ ...base, part: 2, turns: [] }).success).toBe(false);
    expect(ExaminerTurnRequest.safeParse({ ...base, part: 1, turns: answered(6) }).success).toBe(false);
    expect(ExaminerTurnRequest.safeParse({ ...base, part: 1, turns: [{ question: "Q1?", audio_path: rec(1) }, ...answered(1)] }).success).toBe(false);
    expect(ExaminerTurnRequest.safeParse({ ...base, part: 1, turns: [{ question: "Q1?" }] }).success).toBe(false);
    expect(ExaminerTurnRequest.safeParse({ ...base, part: 1, turns: [{ question: "Q1?", audio_path: "a.webm" }] }).success).toBe(false);
  });
});

describe("ExaminerTurnResponse", () => {
  it("open: exactly one next question; done: none", () => {
    expect(ExaminerTurnResponse.safeParse({ transcribed: null, next_question: "Where?", source: "set", question_no: 1, done: false }).success).toBe(true);
    expect(ExaminerTurnResponse.safeParse({ transcribed: { index: 3, transcript: "x" }, next_question: null, source: null, question_no: null, done: true }).success).toBe(true);
    expect(ExaminerTurnResponse.safeParse({ transcribed: null, next_question: "Where?", source: "set", question_no: 5, done: true }).success).toBe(false);
    expect(ExaminerTurnResponse.safeParse({ transcribed: null, next_question: null, source: null, question_no: null, done: false }).success).toBe(false);
  });
});

describe("mockExaminerTurn", () => {
  it("opens, transcribes the newest recording, follows up once, stops at the count", () => {
    const first = mockExaminerTurn({ session_id: S, part: 1, topic_id: T, turns: [] });
    expect(first).toEqual({ transcribed: null, next_question: MOCK_PART1_QUESTIONS[0], source: "set", question_no: 1, done: false });

    const turns: { question: string; transcript?: string; audio_path?: string }[] = [];
    let r = first;
    for (let i = 0; !r.done && i < 10; i++) {
      turns.push({ question: r.next_question!, audio_path: rec(i + 1) });
      r = mockExaminerTurn({ session_id: S, part: 1, topic_id: T, turns });
      expect(r.transcribed?.index).toBe(turns.length - 1);
      turns[turns.length - 1] = { question: turns.at(-1)!.question, transcript: r.transcribed!.transcript };
    }
    expect(turns).toHaveLength(5);
    expect(turns.map((t) => t.question)).toContain("Why do you think that is?");
    expect(r).toMatchObject({ done: true, next_question: null });
  });
  it("errors in the real shape", () => {
    expect(() => mockExaminerTurn({ session_id: S, part: 2, topic_id: T, turns: [] })).toThrow(MockApiError);
  });
});
