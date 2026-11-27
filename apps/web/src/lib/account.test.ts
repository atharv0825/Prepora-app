import { describe, expect, it } from "vitest";
import { avatarUrl, displayName, initials } from "./account";

describe("displayName", () => {
  it("prefers the profile name, then Google's, then the email", () => {
    expect(displayName("Asha Rao", { full_name: "Google Name" }, "a@x.com")).toBe("Asha Rao");
    expect(displayName(null, { full_name: "Google Name" }, "a@x.com")).toBe("Google Name");
    expect(displayName("  ", { name: "Given" }, "a@x.com")).toBe("Given");
    expect(displayName(null, {}, "a@x.com")).toBe("a@x.com");
    expect(displayName(null, null, null)).toBe("Account");
  });

  it("ignores non-string metadata", () => {
    expect(displayName(null, { full_name: 42 }, "a@x.com")).toBe("a@x.com");
  });
});

describe("initials", () => {
  it.each([
    ["Atharv Babar", "AB"],
    ["Asha Mary Rao", "AR"],
    ["asha", "A"],
    ["asha.rao@example.com", "AR"],
    ["x@y.com", "X"],
    ["", "?"],
  ])("%s → %s", (name, out) => {
    expect(initials(name)).toBe(out);
  });
});

describe("avatarUrl", () => {
  it("the Google photo from sign-in, https only", () => {
    expect(avatarUrl({ avatar_url: "https://lh3.googleusercontent.com/a/x" })).toBe("https://lh3.googleusercontent.com/a/x");
    expect(avatarUrl({ picture: "https://lh3.googleusercontent.com/a/y" })).toBe("https://lh3.googleusercontent.com/a/y");
    expect(avatarUrl({ avatar_url: "http://example.com/a.png" })).toBeNull();
    expect(avatarUrl({})).toBeNull();
    expect(avatarUrl(null)).toBeNull();
  });
});
