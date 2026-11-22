import { describe, expect, it } from "vitest";
import { authEventKind, parseAuthEventKind } from "./auth-event";

describe("authEventKind", () => {
  it("is a sign-up when the account was created at this sign-in", () => {
    expect(authEventKind("2026-11-22T10:00:00.000Z", "2026-11-22T10:00:00.420Z")).toBe("signup");
    expect(authEventKind("2026-11-22T10:00:00Z", "2026-11-22T10:00:59Z")).toBe("signup");
  });

  it("is a login for any later sign-in", () => {
    expect(authEventKind("2026-11-01T10:00:00Z", "2026-11-22T10:00:00Z")).toBe("login");
    expect(authEventKind("2026-11-22T10:00:00Z", "2026-11-22T10:01:01Z")).toBe("login");
  });

  it("falls back to login when timestamps are missing or invalid", () => {
    expect(authEventKind(undefined, "2026-11-22T10:00:00Z")).toBe("login");
    expect(authEventKind("2026-11-22T10:00:00Z", undefined)).toBe("login");
    expect(authEventKind("nope", "nope")).toBe("login");
  });
});

describe("parseAuthEventKind", () => {
  it("accepts only our two values", () => {
    expect(parseAuthEventKind("signup")).toBe("signup");
    expect(parseAuthEventKind("login")).toBe("login");
    expect(parseAuthEventKind("admin")).toBeNull();
    expect(parseAuthEventKind(undefined)).toBeNull();
  });
});
