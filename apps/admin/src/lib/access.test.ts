import { describe, expect, it } from "vitest";
import type { Role } from "@prepora/shared/types/profile";
import { accessDecision, adminNext, type Viewer } from "./access";

const at = (path: string) => {
  const u = new URL(path, "https://admin.test");
  return { pathname: u.pathname, search: u.search };
};
const out: Viewer = { signedIn: false };
const as = (role: Role | null): Viewer => ({ signedIn: true, role });

describe("signed out", () => {
  it("sends private pages to login, keeping where they were going", () => {
    expect(accessDecision(at("/dashboard"), out)).toEqual({ action: "redirect", to: "/login" });
    expect(accessDecision(at("/"), out)).toEqual({ action: "redirect", to: "/login" });
    expect(accessDecision(at("/users?q=a"), out)).toEqual({
      action: "redirect",
      to: "/login?next=%2Fusers%3Fq%3Da",
    });
  });

  it("lets the sign-in flow through; /forbidden makes no sense signed out", () => {
    expect(accessDecision(at("/login"), out)).toEqual({ action: "continue" });
    expect(accessDecision(at("/auth/callback?code=x"), out)).toEqual({ action: "continue" });
    expect(accessDecision(at("/forbidden"), out)).toEqual({ action: "redirect", to: "/login" });
  });
});

describe("signed in without a staff role", () => {
  it.each([as("user"), as(null)])("is kept on /forbidden (%o)", (viewer) => {
    expect(accessDecision(at("/dashboard"), viewer)).toEqual({ action: "redirect", to: "/forbidden" });
    expect(accessDecision(at("/login"), viewer)).toEqual({ action: "redirect", to: "/forbidden" });
    expect(accessDecision(at("/users"), viewer)).toEqual({ action: "redirect", to: "/forbidden" });
    expect(accessDecision(at("/forbidden"), viewer)).toEqual({ action: "continue" });
  });
});

describe("staff", () => {
  it.each([as("admin"), as("content_editor")])("gets in (%o)", (viewer) => {
    expect(accessDecision(at("/dashboard"), viewer)).toEqual({ action: "continue" });
    expect(accessDecision(at("/content"), viewer)).toEqual({ action: "continue" });
  });

  it("is sent on from login and forbidden, only to same-site paths", () => {
    expect(accessDecision(at("/login"), as("admin"))).toEqual({ action: "redirect", to: "/dashboard" });
    expect(accessDecision(at("/login?next=%2Fusers"), as("admin"))).toEqual({ action: "redirect", to: "/users" });
    expect(accessDecision(at("/login?next=%2F%2Fevil.com"), as("admin"))).toEqual({
      action: "redirect",
      to: "/dashboard",
    });
    expect(accessDecision(at("/forbidden"), as("content_editor"))).toEqual({ action: "redirect", to: "/dashboard" });
  });
});

describe("adminNext", () => {
  it("maps the root to the dashboard", () => {
    expect(adminNext(null)).toBe("/dashboard");
    expect(adminNext("/")).toBe("/dashboard");
    expect(adminNext("/users")).toBe("/users");
  });
});
