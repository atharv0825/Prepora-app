import { describe, expect, expectTypeOf, it } from "vitest";
import { analyticsEvents, authEvents, type AnalyticsEvent } from "./analytics";

describe("analytics contract", () => {
  it("lists every event exactly once", () => {
    expect(new Set(analyticsEvents).size).toBe(analyticsEvents.length);
    // Every key of AnalyticsEvents is in the runtime list (and nothing else).
    expectTypeOf<(typeof analyticsEvents)[number]>().toEqualTypeOf<AnalyticsEvent>();
  });

  it("uses snake_case names", () => {
    for (const name of analyticsEvents) expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
  });

  it("has the auth events from M1-C2", () => {
    expect(authEvents).toEqual(["signup_completed", "login_completed"]);
    for (const e of authEvents) expect(analyticsEvents).toContain(e);
  });
});
