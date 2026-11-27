import { describe, expect, it } from "vitest";
import { ScoreSpeakingRequest } from "@prepora/shared/api/score-speaking";
import { ExaminerTurnRequest } from "@prepora/shared/api/examiner-turn";
import { answerPath, examinerTurns, fullTestCredits, pickExaminerVoice, pickFullTest, practiceMode, scoreAnswers } from "./examiner";

const v = (lang: string, name: string, localService = true) => ({ lang, name, localService });
const USER = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

describe("the examiner's voice", () => {
  it("prefers British, then Australian, then any English; on-device first", () => {
    const us = v("en-US", "Samantha");
    const au = v("en-AU", "Karen");
    const gbNet = v("en-GB", "Google UK English Female", false);
    const gbLocal = v("en-GB", "Daniel");
    expect(pickExaminerVoice([us, au, gbNet, gbLocal])).toBe(gbLocal);
    expect(pickExaminerVoice([us, au, gbNet])).toBe(gbNet);
    expect(pickExaminerVoice([us, au])).toBe(au);
    expect(pickExaminerVoice([v("fr-FR", "Thomas"), us])).toBe(us);
  });
  it("reads Android's underscore tags, and gives up without an English voice", () => {
    const android = v("en_GB", "English United Kingdom");
    expect(pickExaminerVoice([v("en_US", "x"), android])).toBe(android);
    expect(pickExaminerVoice([v("de-DE", "Anna")])).toBeNull();
    expect(pickExaminerVoice([])).toBeNull();
  });
});

describe("answers", () => {
  const qa = [
    { question: "Where is your hometown?", audioPath: answerPath(USER, SESSION, 1, 1, "webm", "a1"), seconds: 20, transcript: "In the north." },
    { question: "What do you like about it?", audioPath: answerPath(USER, SESSION, 1, 2, "m4a", "b2"), seconds: 0 },
  ];
  it("names recordings in the student's folder, per part and question", () => {
    expect(qa[0]!.audioPath).toBe(`${USER}/${SESSION}-p1-q1-a1.webm`);
  });
  it("builds a valid examiner-turn request: the newest answer may be a recording only", () => {
    const req = { session_id: SESSION, part: 1, topic_id: SESSION, turns: examinerTurns(qa) };
    expect(ExaminerTurnRequest.safeParse(req).success).toBe(true);
    expect(req.turns[1]).toEqual({ question: "What do you like about it?", audio_path: qa[1]!.audioPath, duration_sec: 1 });
  });
  it("builds a valid score-speaking request from 4–5 answers", () => {
    const four = [...qa, ...qa].map((t, i) => ({ ...t, question: `${t.question} ${i}` }));
    const req = { session_id: SESSION, topic_id: SESSION, part: 3, answers: scoreAnswers(four) };
    expect(ScoreSpeakingRequest.safeParse(req).success).toBe(true);
    expect(req.answers[0]).not.toHaveProperty("transcript");
  });
});

describe("sessions and costs", () => {
  it("practises one part in its own mode", () => {
    expect(practiceMode(1)).toBe("part1");
    expect(practiceMode(3)).toBe("part3");
  });
  it("adds up the three parts' credits for a full test", () => {
    expect(fullTestCredits({ speaking_p1: { credits: 5 }, speaking_p2: { credits: 4 }, speaking_p3: { credits: 6 } })).toBe(15);
    expect(fullTestCredits({ speaking_p1: { credits: 5 } })).toBeNull();
  });
});

describe("the full test's topics", () => {
  const pool = {
    part1: ["s1", "s2"],
    cards: ["c1", "c2", "c3"],
    discussions: [
      { id: "d1", card: "c1" },
      { id: "d2", card: "c2" },
      { id: "d3", card: "c2" },
    ],
  };
  const first = () => 0;
  it("picks a set, a card that has a discussion, and one of its discussions", () => {
    expect(pickFullTest(pool, {}, {}, undefined, first)).toEqual({ p1: "s1", card: "c1", p3: "d1" });
    expect(pickFullTest(pool, {}, {}, undefined, () => 0.99)).toEqual({ p1: "s2", card: "c2", p3: "d3" });
  });
  it("keeps the URL's topics while published, and the scored parts' always", () => {
    expect(pickFullTest(pool, {}, { p1: "s2", card: "c2", p3: "d3" }, undefined, first)).toEqual({ p1: "s2", card: "c2", p3: "d3" });
    expect(pickFullTest(pool, {}, { p1: "gone", card: "c3", p3: "d1" }, undefined, first)).toEqual({ p1: "s1", card: "c1", p3: "d1" });
    expect(pickFullTest(pool, { p1: "old-set", card: "c2" }, { card: "c1" }, undefined, first)).toEqual({ p1: "old-set", card: "c2", p3: "d2" });
  });
  it("avoids a card when asked, unless it's the only one", () => {
    expect(pickFullTest(pool, {}, {}, "c1", first)?.card).toBe("c2");
    expect(pickFullTest({ ...pool, cards: ["c1"] }, {}, {}, "c1", first)?.card).toBe("c1");
  });
  it("needs a set and a card with a discussion", () => {
    expect(pickFullTest({ ...pool, part1: [] }, {}, {})).toBeNull();
    expect(pickFullTest({ ...pool, discussions: [] }, {}, {})).toBeNull();
  });
});
