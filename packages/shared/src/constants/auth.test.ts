import { describe, expect, it } from "vitest";
import { authCallbackUrl, safeNextPath } from "./auth";

describe("safeNextPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/speaking?part=2#top", "/app/speaking?part=2#top"],
    ["/app/../account", "/account"],
  ])("keeps same-site path %s", (input, out) => {
    expect(safeNextPath(input, "/fallback")).toBe(out);
  });

  it.each([
    null,
    undefined,
    "",
    "app",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "/" + "a".repeat(600),
  ])("rejects %o", (input) => {
    expect(safeNextPath(input, "/fallback")).toBe("/fallback");
  });
});

describe("authCallbackUrl", () => {
  it("builds the callback with a safe next", () => {
    expect(authCallbackUrl("https://staging.prepora.site", "/app/writing", "/app")).toBe(
      "https://staging.prepora.site/auth/callback?next=%2Fapp%2Fwriting",
    );
    expect(authCallbackUrl("http://localhost:3000", "//evil.com", "/app")).toBe(
      "http://localhost:3000/auth/callback?next=%2Fapp",
    );
  });
});
