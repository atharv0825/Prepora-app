import { describe, expect, it } from "vitest";
import { actionKeys } from "../api/credits";
import { countFillers, countSpokenWords, PART2_MIN_SECONDS, SPEAKING_PARTS, speakingCriterionLabel, speakingPartBand, wordsPerMinute } from "./speaking";

describe("speakingPartBand", () => {
  it("averages the four criteria and rounds down to a half band", () => {
    expect(speakingPartBand({ fc: 6, lr: 6, gra: 6, pron: 6 })).toBe(6);
    expect(speakingPartBand({ fc: 7, lr: 6.5, gra: 6.5, pron: 7 })).toBe(6.5); // 6.75 → 6.5
    expect(speakingPartBand({ fc: 6.5, lr: 6, gra: 6, pron: 6.5 })).toBe(6); // 6.25 → 6
    expect(speakingPartBand({ fc: 6, lr: 7, gra: 6, pron: 7 })).toBe(6.5);
    expect(() => speakingPartBand({ fc: 6.2, lr: 6, gra: 6, pron: 6 })).toThrow(RangeError);
  });
});

describe("parts", () => {
  it("credit actions, Part 2's 1 + 2 minutes, labels", () => {
    for (const p of [1, 2, 3] as const) expect(actionKeys).toContain(SPEAKING_PARTS[p].actionKey);
    expect(SPEAKING_PARTS[2]).toMatchObject({ prepSeconds: 60, maxSeconds: 120 });
    expect(PART2_MIN_SECONDS).toBe(60);
    expect(speakingCriterionLabel("pron")).toBe("Pronunciation");
    expect(speakingCriterionLabel("fc")).toBe("Fluency and Coherence");
  });
});

describe("fillers and rate", () => {
  it("counts hesitation fillers as whole words, case-insensitive, most frequent first", () => {
    expect(countFillers("Um, I think, uh, that um it's, you know, umbrella. Er... I MEAN it. Erm.")).toEqual([
      { word: "um", count: 2 },
      { word: "er", count: 1 },
      { word: "erm", count: 1 },
      { word: "i mean", count: 1 },
      { word: "uh", count: 1 },
      { word: "you know", count: 1 },
    ]);
    expect(countFillers("I like summer and humming.")).toEqual([]); // "like" isn't counted; "um" inside words isn't either
    expect(countFillers("You\n know what")).toEqual([{ word: "you know", count: 1 }]);
  });
  it("words and words per minute", () => {
    expect(countSpokenWords("Um, I go there — often.")).toBe(5); // fillers count: they take time
    expect(wordsPerMinute(220, 110)).toBe(120);
    expect(wordsPerMinute(10, 0)).toBeNull();
    expect(wordsPerMinute(10, null)).toBeNull();
  });
});
