import { describe, expect, it } from "vitest";
import { AUTH_CALLBACK_PATH, DEFAULT_NEXT_PATH } from "@prepora/shared/constants/auth";
import { isActive, mainNav, routes } from "./routes";

describe("isActive", () => {
  it("matches Home only on the exact root path", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/status", "/")).toBe(false);
  });

  it("never marks hash links active by path (the landing page uses scroll-spy for those)", () => {
    expect(isActive("/", "/#modules")).toBe(false);
  });

  it("matches a path and its sub-paths, not look-alike paths", () => {
    expect(isActive("/status", "/status")).toBe(true);
    expect(isActive("/status/details", "/status")).toBe(true);
    expect(isActive("/statusbar", "/status")).toBe(false);
  });
});

describe("navigation", () => {
  it("every main nav link points at a known route", () => {
    const known = new Set<string>(Object.values(routes));
    for (const item of mainNav) expect(known.has(item.href)).toBe(true);
  });
});

describe("auth routes", () => {
  it("match the shared auth contract (Supabase redirect allowlist, docs/auth.md)", () => {
    expect(routes.authCallback).toBe(AUTH_CALLBACK_PATH);
    expect(routes.app).toBe(DEFAULT_NEXT_PATH.web);
  });
});
