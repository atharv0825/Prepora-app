import { describe, expect, it } from "vitest";
import { authErrorMessage, callbackStep, loginUrlWithError, nextPath } from "./auth";

const q = (s: string) => new URLSearchParams(s);

describe("callbackStep", () => {
  it("exchanges a code and keeps a safe next", () => {
    expect(callbackStep(q("code=abc&next=%2Fapp%2Fwriting"))).toEqual({
      kind: "exchange",
      code: "abc",
      next: "/app/writing",
    });
  });

  it("falls back to /app for missing or unsafe next", () => {
    expect(callbackStep(q("code=abc"))).toMatchObject({ next: "/app" });
    expect(callbackStep(q("code=abc&next=%2F%2Fevil.com"))).toMatchObject({ next: "/app" });
    expect(callbackStep(q("code=abc&next=https%3A%2F%2Fevil.com"))).toMatchObject({ next: "/app" });
  });

  it("maps a closed Google screen to cancelled", () => {
    expect(callbackStep(q("error=access_denied&error_description=x"))).toEqual({
      kind: "error",
      error: "cancelled",
    });
  });

  it("treats other errors and a missing code as a callback error", () => {
    expect(callbackStep(q("error=server_error"))).toEqual({ kind: "error", error: "callback" });
    expect(callbackStep(q(""))).toEqual({ kind: "error", error: "callback" });
  });
});

describe("nextPath", () => {
  it("uses the first value of a repeated param", () => {
    expect(nextPath(["/app/reading", "/x"])).toBe("/app/reading");
    expect(nextPath(undefined)).toBe("/app");
  });
});

describe("loginUrlWithError", () => {
  it("keeps a non-default next", () => {
    expect(loginUrlWithError("cancelled", "/app/speaking")).toBe(
      "/login?error=cancelled&next=%2Fapp%2Fspeaking",
    );
    expect(loginUrlWithError("callback", "/app")).toBe("/login?error=callback");
    expect(loginUrlWithError("callback", "//evil.com")).toBe("/login?error=callback");
  });
});

describe("authErrorMessage", () => {
  it("only knows our codes", () => {
    expect(authErrorMessage("cancelled")).toMatch(/cancelled/);
    expect(authErrorMessage("<script>")).toBeNull();
    expect(authErrorMessage("toString")).toBeNull();
    expect(authErrorMessage(null)).toBeNull();
  });
});
