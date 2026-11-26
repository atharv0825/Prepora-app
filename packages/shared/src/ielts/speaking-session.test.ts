import { describe, expect, it } from "vitest";
import { canAnswer, examinerDone, partsOf, QUESTIONS_PER_PART, sessionOverallBand, sessionStage, stageAfter } from "./speaking-session";

describe("session state machine (M8-C1)", () => {
  it("a full test goes Part 1 → Part 2 → Part 3 → finished, from the parts scored", () => {
    expect(partsOf("full_test")).toEqual([1, 2, 3]);
    expect(sessionStage("full_test", [])).toBe("part1");
    expect(sessionStage("full_test", [1])).toBe("part2");
    expect(sessionStage("full_test", [1, 2])).toBe("part3");
    expect(sessionStage("full_test", [2, 1, 3])).toBe("finished");
    expect(stageAfter("full_test", [1], 2)).toBe("part3");
    expect(stageAfter("full_test", [1, 2], 3)).toBe("finished");
  });
  it("only the current part can be answered: no skipping ahead or going back", () => {
    expect(canAnswer("full_test", [], 1)).toBe(true);
    expect(canAnswer("full_test", [], 2)).toBe(false);
    expect(canAnswer("full_test", [1], 1)).toBe(false);
    expect(canAnswer("full_test", [1, 2, 3], 3)).toBe(false);
    expect(() => stageAfter("full_test", [], 3)).toThrow(/can't be answered now \(stage part1\)/);
  });
  it("a single-part session is that part, then finished", () => {
    expect(partsOf("part2")).toEqual([2]);
    expect(sessionStage("part2", [])).toBe("part2");
    expect(sessionStage("part3", [3])).toBe("finished");
    expect(canAnswer("part1", [], 2)).toBe(false);
    expect(stageAfter("part1", [], 1)).toBe("finished");
  });
  it("overall band: the part's own band, or the IELTS-rounded mean of the three; null until finished", () => {
    expect(sessionOverallBand("part2", { 2: 6.5 })).toBe(6.5);
    expect(sessionOverallBand("full_test", { 1: 6, 2: 6.5, 3: 6.5 })).toBe(6.5); // 6.33 → 6.5
    expect(sessionOverallBand("full_test", { 1: 6.5, 2: 7, 3: 7 })).toBe(7); // 6.83 → 7
    expect(sessionOverallBand("full_test", { 1: 6, 2: 6.5 })).toBeNull();
  });
});

describe("examiner turns", () => {
  it("4–5 questions in Parts 1 and 3: never stops before 4, always at 5", () => {
    expect(QUESTIONS_PER_PART).toEqual({ 1: { min: 4, max: 5 }, 3: { min: 4, max: 5 } });
    expect(examinerDone(1, 3, true)).toBe(false);
    expect(examinerDone(1, 4, true)).toBe(true);
    expect(examinerDone(1, 4, false)).toBe(false);
    expect(examinerDone(3, 5, false)).toBe(true);
  });
});
