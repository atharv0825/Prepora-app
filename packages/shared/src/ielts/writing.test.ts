import { describe, expect, it } from "vitest";
import { actionKeys } from "../api/credits";
import { countEssayWords, criterionLabel, isHalfBand, isUnderLength, WRITING_TASKS, writingTaskBand } from "./writing";

describe("writingTaskBand", () => {
  it("averages the four criteria and rounds down to a half band", () => {
    expect(writingTaskBand({ ta: 7, cc: 7, lr: 7, gra: 7 })).toBe(7);
    expect(writingTaskBand({ ta: 7, cc: 7, lr: 6.5, gra: 6.5 })).toBe(6.5); // 6.75 → 6.5
    expect(writingTaskBand({ ta: 6.5, cc: 6, lr: 6, gra: 6.5 })).toBe(6); // 6.25 → 6
    expect(writingTaskBand({ ta: 6, cc: 7, lr: 6, gra: 7 })).toBe(6.5); // 6.5 stays
    expect(writingTaskBand({ ta: 9, cc: 9, lr: 9, gra: 8.5 })).toBe(8.5); // 8.875 → 8.5
    expect(writingTaskBand({ ta: 0, cc: 0, lr: 0, gra: 0.5 })).toBe(0);
  });

  it("refuses criteria that aren't bands", () => {
    expect(() => writingTaskBand({ ta: 6.3, cc: 6, lr: 6, gra: 6 })).toThrow(RangeError);
    expect(() => writingTaskBand({ ta: 10, cc: 6, lr: 6, gra: 6 })).toThrow(RangeError);
    expect(isHalfBand(5.5)).toBe(true);
    expect(isHalfBand(-0.5)).toBe(false);
    expect(isHalfBand(Number.NaN)).toBe(false);
  });
});

describe("countEssayWords", () => {
  it("counts words as the editor shows them", () => {
    expect(countEssayWords("")).toBe(0);
    expect(countEssayWords("   \n ")).toBe(0);
    expect(countEssayWords("Remote work is here to stay.")).toBe(6);
    expect(countEssayWords("A well-known fact: 25% of staff — maybe more … agree.")).toBe(9);
    expect(countEssayWords("line one\n\nline   two\ttabbed")).toBe(5);
    expect(countEssayWords("Ça coûte cher, n'est-ce pas ?")).toBe(5);
  });
});

describe("tasks", () => {
  it("has the exam's lengths, times and credit actions", () => {
    expect(WRITING_TASKS[1]).toEqual({ minWords: 150, minutes: 20, actionKey: "writing_t1" });
    expect(WRITING_TASKS[2]).toEqual({ minWords: 250, minutes: 40, actionKey: "writing_t2" });
    for (const t of [1, 2] as const) expect(actionKeys).toContain(WRITING_TASKS[t].actionKey);
    expect(isUnderLength(149, 1)).toBe(true);
    expect(isUnderLength(150, 1)).toBe(false);
    expect(isUnderLength(249, 2)).toBe(true);
  });

  it("names Task Achievement for Task 1 and Task Response for Task 2", () => {
    expect(criterionLabel("ta", 1)).toBe("Task Achievement");
    expect(criterionLabel("ta", 2)).toBe("Task Response");
    expect(criterionLabel("gra", 2)).toBe("Grammatical Range and Accuracy");
  });
});
