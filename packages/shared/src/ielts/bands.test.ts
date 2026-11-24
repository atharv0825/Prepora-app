import { describe, expect, it } from "vitest";
import { READING_BANDS, readingBand, scaledRawScore } from "./bands";

describe("Reading band tables (M4-C2)", () => {
  it.each([
    ["academic", 40, 9],
    ["academic", 39, 9],
    ["academic", 30, 7],
    ["academic", 29, 6.5],
    ["academic", 23, 6],
    ["academic", 15, 5],
    ["academic", 4, 2.5],
    ["academic", 0, 0],
    ["general", 40, 9],
    ["general", 39, 8.5],
    ["general", 34, 7],
    ["general", 30, 6],
    ["general", 23, 5],
    ["general", 15, 4],
    ["general", 6, 2.5],
    ["general", 0, 0],
  ] as const)("%s %i/40 → %d", (type, raw, band) => {
    expect(readingBand(type, raw)).toBe(band);
  });

  it("General needs more correct answers than Academic for the same band", () => {
    expect(readingBand("academic", 30)).toBe(7);
    expect(readingBand("general", 30)).toBe(6);
  });

  it("covers every raw score 0–40 with a whole or half band that never drops as the score rises", () => {
    for (const type of ["academic", "general"] as const) {
      let previous = -1;
      for (let raw = 0; raw <= 40; raw++) {
        const band = readingBand(type, raw);
        expect(band * 2).toBe(Math.trunc(band * 2));
        expect(band).toBeGreaterThanOrEqual(previous);
        previous = band;
      }
      expect(READING_BANDS[type].at(-1)).toEqual([0, 0]);
    }
  });

  it("scales a short test to 40, rounding down", () => {
    expect(scaledRawScore(10, 14)).toBe(28);
    expect(scaledRawScore(14, 14)).toBe(40);
    expect(scaledRawScore(0, 14)).toBe(0);
    expect(readingBand("academic", 10, 14)).toBe(6.5);
    expect(() => scaledRawScore(15, 14)).toThrow(RangeError);
    expect(() => scaledRawScore(1, 0)).toThrow(RangeError);
  });
});
