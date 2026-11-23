import { describe, expect, it } from "vitest";
import { findModule, isActive, navGroups, placeholderModules, sectionModules } from "./nav";

describe("admin navigation", () => {
  const all = navGroups.flatMap((g) => g.items);

  it("has the 12 modules from plan §6 with unique slugs", () => {
    expect(all).toHaveLength(12);
    expect(new Set(all.map((m) => m.slug)).size).toBe(12);
  });

  it("every module names a milestone and at least one planned feature", () => {
    for (const m of all) {
      expect(m.milestone).toMatch(/^M\d+/);
      expect(m.features.length).toBeGreaterThan(0);
    }
  });

  it("section pages exclude the dashboard (it has its own page)", () => {
    expect(sectionModules.some((m) => m.slug === "dashboard")).toBe(false);
    expect(sectionModules).toHaveLength(11);
  });

  it("placeholder pages skip built modules (they have their own route)", () => {
    expect(findModule("users")?.built).toBe(true);
    expect(placeholderModules.some((m) => m.slug === "users")).toBe(false);
    expect(placeholderModules.every((m) => !m.built)).toBe(true);
  });

  it("finds modules by slug", () => {
    expect(findModule("reading")?.label).toBe("Reading");
    expect(findModule("nope")).toBeUndefined();
  });

  it("marks a module active for its path and sub-paths only", () => {
    expect(isActive("/users", "users")).toBe(true);
    expect(isActive("/users/42", "users")).toBe(true);
    expect(isActive("/users-old", "users")).toBe(false);
  });
});
