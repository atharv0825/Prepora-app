import { describe, expect, it } from "vitest";
import { ieltsRound, overallBand } from "./bands";

describe("ieltsRound (M8-C2): nearest half band, quarters up", () => {
  it("x.25 → x.5 and x.75 → the next whole band", () => {
    expect(ieltsRound(6.25)).toBe(6.5);
    expect(ieltsRound(6.75)).toBe(7);
    expect(ieltsRound(8.75)).toBe(9);
    expect(ieltsRound(0.25)).toBe(0.5);
  });
  it("below a quarter goes down; up to three quarters is the half", () => {
    expect(ieltsRound(6)).toBe(6);
    expect(ieltsRound(6.1)).toBe(6);
    expect(ieltsRound(6.24)).toBe(6);
    expect(ieltsRound(6.5)).toBe(6.5);
    expect(ieltsRound(6.6)).toBe(6.5);
    expect(ieltsRound(6.74)).toBe(6.5);
    expect(ieltsRound(0)).toBe(0);
    expect(ieltsRound(9)).toBe(9);
  });
  it("floating-point averages land on the right side of a boundary", () => {
    // (6 + 6.5 + 6.5 + 6) / 4 = 6.25 exactly; 18.75 / 3 = 6.25; 0.1 + 0.2 style drift.
    expect(ieltsRound((6 + 6.5 + 6.5 + 6) / 4)).toBe(6.5);
    expect(ieltsRound(6.2499999999)).toBe(6.5);
    expect(ieltsRound(6.7499999999)).toBe(7);
    expect(ieltsRound(6.2499)).toBe(6);
  });
  it("refuses values that aren't band averages", () => {
    for (const v of [-0.1, 9.1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => ieltsRound(v)).toThrow(RangeError);
  });
});

describe("overallBand", () => {
  it("the IELTS-rounded mean of the parts", () => {
    expect(overallBand([6, 6.5, 6.5])).toBe(6.5); // 6.333…
    expect(overallBand([6, 6, 6.5])).toBe(6); // 6.1666…
    expect(overallBand([6.5, 7, 7])).toBe(7); // 6.8333…
    expect(overallBand([6, 6.5, 6.5, 6])).toBe(6.5); // 6.25: four modules, as the overall test band
    expect(overallBand([7, 7, 6.5, 6.5])).toBe(7); // 6.75
    expect(overallBand([5])).toBe(5);
    expect(() => overallBand([])).toThrow(RangeError);
  });
});
