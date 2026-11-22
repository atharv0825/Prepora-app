import { describe, expect, it } from "vitest";
import { Constants } from "../db";
import { countryFromHeader, isLaunchStatus, LAUNCH_STATUS_FALLBACK } from "./launch-status";

describe("countryFromHeader", () => {
  it.each([
    ["IN", "IN"],
    [" np ", "NP"],
    ["lk", "LK"],
  ])("%j → %s", (input, out) => {
    expect(countryFromHeader(input)).toBe(out);
  });

  it.each([null, undefined, "", "XX", "xx", "T1", "IND", "India", "1N"])("%j → null", (input) => {
    expect(countryFromHeader(input)).toBeNull();
  });
});

describe("launch status", () => {
  it("matches the database enum", () => {
    expect(Constants.public.Enums.launch_status).toEqual(["enabled", "waitlist"]);
    expect(isLaunchStatus("enabled")).toBe(true);
    expect(isLaunchStatus("waitlist")).toBe(true);
    expect(isLaunchStatus("open")).toBe(false);
  });

  it("falls back to the waitlist, never to sign-up", () => {
    expect(LAUNCH_STATUS_FALLBACK).toBe("waitlist");
  });
});
