// A mock examiner-turn (M8-C1), so the examiner screens (M8-F1/F2) can be built before the function
// (M8-B1). Deterministic: it asks the topic's questions in order, with one follow-up after a long
// second answer, and stops at the part's question count. Parsed by the contract before returning.
import { ExaminerTurnRequest, ExaminerTurnResponse } from "../api/examiner-turn";
import { examinerDone } from "../ielts/speaking-session";
import { MockApiError } from "./writing";

export const MOCK_PART1_QUESTIONS = [
  "Let's talk about your hometown. Where is your hometown?",
  "What do you like most about living there?",
  "Has it changed much since you were a child?",
  "Now let's talk about free time. What do you usually do at the weekend?",
  "Do you prefer spending free time alone or with others?",
];

const MOCK_TRANSCRIPT = "Well, um, I'm from a small coastal town, and I really like it because it's quiet and the people are friendly.";

export function mockExaminerTurn(input: unknown, questions: readonly string[] = MOCK_PART1_QUESTIONS): ExaminerTurnResponse {
  const parsed = ExaminerTurnRequest.safeParse(input);
  if (!parsed.success) {
    throw new MockApiError(400, { error: { code: "validation_failed", message: "Invalid request", details: parsed.error.issues } });
  }
  const { part, turns } = parsed.data;
  const last = turns.at(-1);
  const transcribed = last && last.transcript === undefined ? { index: turns.length - 1, transcript: MOCK_TRANSCRIPT } : null;
  const asked = turns.length;
  if (examinerDone(part, asked, asked >= questions.length)) {
    return ExaminerTurnResponse.parse({ transcribed, next_question: null, source: null, question_no: null, done: true });
  }
  // One follow-up, after the second answer, if it was a long one.
  const answer = transcribed?.transcript ?? last?.transcript ?? "";
  const followUp = asked === 2 && answer.split(/\s+/).length > 15 && !turns.some((t) => t.question.startsWith("Why"));
  const setAsked = turns.filter((t) => !t.question.startsWith("Why")).length;
  return ExaminerTurnResponse.parse({
    transcribed,
    next_question: followUp ? "Why do you think that is?" : questions[setAsked] ?? questions.at(-1)!,
    source: followUp ? "follow_up" : "set",
    question_no: asked + 1,
    done: false,
  });
}
