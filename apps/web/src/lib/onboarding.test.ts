import { describe, expect, it } from "vitest";
import { daysBetween, examDateRange, formatBand, localDate, validTimeZone } from "./onboarding";

describe("validTimeZone", () => {
  it("accepts IANA zones", () => {
    expect(validTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(validTimeZone("UTC")).toBe("UTC");
  });

  it.each([[""], ["Mars/Base"], [42], [null], ["x".repeat(65)]])("rejects %j", (value) => {
    expect(validTimeZone(value)).toBeNull();
  });
});

describe("localDate", () => {
  // 2026-11-23 20:00 UTC: already the 24th in Kolkata (+5:30), still the 23rd in New York.
  const now = new Date("2026-11-23T20:00:00Z");

  it("uses the student's time zone", () => {
    expect(localDate("Asia/Kolkata", now)).toBe("2026-11-24");
    expect(localDate("America/New_York", now)).toBe("2026-11-23");
  });

  it("defaults to UTC", () => {
    expect(localDate(null, now)).toBe("2026-11-23");
  });
});

describe("examDateRange", () => {
  it("runs from today to two years ahead", () => {
    expect(examDateRange("2026-11-23")).toEqual({ min: "2026-11-23", max: "2028-11-23" });
    expect(examDateRange("2028-02-29")).toEqual({ min: "2028-02-29", max: "2030-02-28" });
  });
});

describe("daysBetween", () => {
  it("counts whole days, across month and DST boundaries", () => {
    expect(daysBetween("2026-11-23", "2026-11-23")).toBe(0);
    expect(daysBetween("2026-11-23", "2026-12-01")).toBe(8);
    expect(daysBetween("2027-03-01", "2027-04-01")).toBe(31);
    expect(daysBetween("2026-11-23", "2026-11-22")).toBe(-1);
  });
});

describe("formatBand", () => {
  it("always shows one decimal", () => {
    expect(formatBand(7)).toBe("7.0");
    expect(formatBand(6.5)).toBe("6.5");
  });
});
