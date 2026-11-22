import { describe, expect, it } from "vitest";
import { mmss, typed } from "./shared";

describe("mmss", () => {
  it.each([
    [0, "0:00"],
    [5.9, "0:05"],
    [62, "1:02"],
    [600, "10:00"],
    [-3, "0:00"],
  ])("%s s → %s", (s, out) => {
    expect(mmss(s)).toBe(out);
  });
});

describe("typed", () => {
  it("reveals nothing before the start time", () => {
    expect(typed("hello", 100, 500, 10)).toBe("");
  });
  it("reveals characters at the given speed", () => {
    expect(typed("hello world", 1500, 500, 5)).toBe("hello"); // 1 s × 5 chars/s
  });
  it("never goes past the end of the text", () => {
    expect(typed("hi", 99_000, 0, 50)).toBe("hi");
  });
});
