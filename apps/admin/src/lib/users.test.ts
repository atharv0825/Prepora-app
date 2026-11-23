import { describe, expect, it } from "vitest";
import { bandLabel, countryName, formatDate, formatDateTime, isUuid, testTypeLabel, titleCase } from "./users";

describe("countryName", () => {
  it("names ISO codes", () => {
    expect(countryName("IN")).toBe("India");
    expect(countryName("NP")).toBe("Nepal");
  });

  it("falls back to the code or a dash", () => {
    expect(countryName(null)).toBe("—");
    expect(countryName("!!")).toBe("!!");
  });
});

describe("dates", () => {
  it("formats in UTC", () => {
    expect(formatDate("2026-11-23T23:30:00+00:00")).toBe("23 Nov 2026");
    expect(formatDateTime("2026-11-23T14:05:00Z")).toBe("23 Nov 2026, 14:05 UTC");
  });

  it("handles missing and invalid values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("nope")).toBe("—");
    expect(formatDateTime(null)).toBe("Never");
    expect(formatDateTime(null, "—")).toBe("—");
  });
});

describe("labels", () => {
  it("formats plans, roles, test types and bands", () => {
    expect(titleCase("platinum")).toBe("Platinum");
    expect(titleCase("content_editor")).toBe("Content Editor");
    expect(titleCase(null)).toBe("—");
    expect(testTypeLabel("general")).toBe("General Training");
    expect(testTypeLabel(null)).toBe("—");
    expect(bandLabel(7)).toBe("7.0");
    expect(bandLabel(null)).toBe("—");
  });
});

describe("isUuid", () => {
  it("accepts UUIDs only", () => {
    expect(isUuid("a0000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isUuid("42")).toBe(false);
    expect(isUuid("a0000000-0000-0000-0000-000000000001; drop")).toBe(false);
  });
});
