import { describe, expect, it } from "vitest";
import { ProfileUpdate } from "../types/profile";
import { needsOnboarding, onboardingBands, onboardingInput } from "./onboarding";

const schema = onboardingInput("2026-11-22");

describe("onboardingInput", () => {
  it("accepts a complete answer", () => {
    expect(schema.parse({ test_type: "general", target_band: 6.5, exam_date: "2027-02-10" })).toEqual({
      test_type: "general",
      target_band: 6.5,
      exam_date: "2027-02-10",
    });
  });

  it("allows skipping the exam date (null), and today", () => {
    expect(schema.parse({ test_type: "academic", target_band: 7, exam_date: null }).exam_date).toBeNull();
    expect(schema.parse({ test_type: "academic", target_band: 7, exam_date: "2026-11-22" }).exam_date).toBe("2026-11-22");
  });

  it.each([
    [{ target_band: 7, exam_date: null }, "test_type"],
    [{ test_type: "computer", target_band: 7, exam_date: null }, "test_type"],
    [{ test_type: "academic", exam_date: null }, "target_band"],
    [{ test_type: "academic", target_band: 3.5, exam_date: null }, "target_band"],
    [{ test_type: "academic", target_band: 7.25, exam_date: null }, "target_band"],
    [{ test_type: "academic", target_band: 9.5, exam_date: null }, "target_band"],
    [{ test_type: "academic", target_band: 7, exam_date: "2026-11-21" }, "exam_date"],
    [{ test_type: "academic", target_band: 7, exam_date: "2028-11-23" }, "exam_date"],
    [{ test_type: "academic", target_band: 7, exam_date: "22/12/2026" }, "exam_date"],
    [{ test_type: "academic", target_band: 7 }, "exam_date"],
    [{ test_type: "academic", target_band: 7, exam_date: null, role: "admin" }, "role"],
  ])("rejects %o (issue on %s)", (input, path) => {
    const r = schema.safeParse(input);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain(path);
  });

  it("allows exactly two years ahead, clamping Feb 29", () => {
    expect(schema.safeParse({ test_type: "academic", target_band: 7, exam_date: "2028-11-22" }).success).toBe(true);
    const leap = onboardingInput("2028-02-29");
    expect(leap.safeParse({ test_type: "academic", target_band: 7, exam_date: "2030-02-28" }).success).toBe(true);
    expect(leap.safeParse({ test_type: "academic", target_band: 7, exam_date: "2030-03-01" }).success).toBe(false);
  });

  it("every valid answer is also a valid profile update (fits the DB rules)", () => {
    for (const band of onboardingBands) {
      const answer = schema.parse({ test_type: "academic", target_band: band, exam_date: "2027-01-01" });
      expect(ProfileUpdate.safeParse(answer).success).toBe(true);
    }
  });
});

describe("onboardingBands", () => {
  it("is 4.0 to 9.0 in half steps", () => {
    expect(onboardingBands).toEqual([4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]);
  });
});

describe("needsOnboarding", () => {
  it("is true until test type and band are set", () => {
    expect(needsOnboarding(null)).toBe(true);
    expect(needsOnboarding({ test_type: null, target_band: null })).toBe(true);
    expect(needsOnboarding({ test_type: "academic", target_band: null })).toBe(true);
    expect(needsOnboarding({ test_type: "academic", target_band: 7 })).toBe(false);
  });
});
