import { describe, expect, it } from "vitest";
import { isAuthPage, isProtectedPath, routeDecision } from "./auth-routes";

const at = (path: string) => {
  const u = new URL(path, "https://x.test");
  return { pathname: u.pathname, search: u.search };
};

describe("isProtectedPath", () => {
  it.each(["/app", "/app/", "/app/speaking", "/app/writing/task-2"])("%s is protected", (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
  it.each(["/", "/apple", "/application", "/login", "/status", "/auth/callback"])(
    "%s is public",
    (p) => expect(isProtectedPath(p)).toBe(false),
  );
});

describe("isAuthPage", () => {
  it("is login and signup only", () => {
    expect(isAuthPage("/login")).toBe(true);
    expect(isAuthPage("/signup")).toBe(true);
    expect(isAuthPage("/auth/callback")).toBe(false);
    expect(isAuthPage("/login/extra")).toBe(false);
  });
});

describe("routeDecision", () => {
  it("sends signed-out visitors of /app to login, keeping where they were going", () => {
    expect(routeDecision(at("/app"), false, "/app")).toEqual({ action: "redirect", to: "/login" });
    expect(routeDecision(at("/app/writing?task=2"), false, "/app")).toEqual({
      action: "redirect",
      to: "/login?next=%2Fapp%2Fwriting%3Ftask%3D2",
    });
  });

  it("lets signed-in users into /app", () => {
    expect(routeDecision(at("/app/speaking"), true, "/app")).toEqual({ action: "continue" });
  });

  it("sends signed-in users away from login/signup to their next", () => {
    expect(routeDecision(at("/login"), true, "/app")).toEqual({ action: "redirect", to: "/app" });
    expect(routeDecision(at("/signup?next=%2Fapp%2Freading"), true, "/app/reading")).toEqual({
      action: "redirect",
      to: "/app/reading",
    });
  });

  it("leaves public pages alone", () => {
    expect(routeDecision(at("/"), false, "/app")).toEqual({ action: "continue" });
    expect(routeDecision(at("/login"), false, "/app")).toEqual({ action: "continue" });
    expect(routeDecision(at("/status"), true, "/app")).toEqual({ action: "continue" });
  });
});
