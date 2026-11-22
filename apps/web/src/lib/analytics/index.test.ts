import { beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  __loaded: true,
  distinctId: "anon-123",
  get_distinct_id: vi.fn(function (this: { distinctId: string }) {
    return this.distinctId;
  }),
  identify: vi.fn(),
  setPersonProperties: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}));
const sentry = vi.hoisted(() => ({ setUser: vi.fn() }));

vi.mock("posthog-js", () => ({ default: posthog }));
vi.mock("@sentry/nextjs", () => sentry);

const { identifyUser, resetUser, track } = await import("./index");

beforeEach(() => {
  vi.clearAllMocks();
  posthog.__loaded = true;
  posthog.distinctId = "anon-123";
  vi.stubGlobal("window", {});
});

describe("identifyUser", () => {
  it("identifies a new user in PostHog and sets the Sentry user to the id only", () => {
    identifyUser("user-1", { plan: "free", country_code: "IN" });
    expect(posthog.identify).toHaveBeenCalledWith("user-1", { plan: "free", country_code: "IN" });
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "user-1" });
  });

  it("doesn't identify again when PostHog already knows the user; updates properties instead", () => {
    posthog.distinctId = "user-1";
    identifyUser("user-1", { plan: "gold" });
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.setPersonProperties).toHaveBeenCalledWith({ plan: "gold" });
  });

  it("still sets the Sentry user when PostHog is off (no key / local dev)", () => {
    posthog.__loaded = false;
    identifyUser("user-1", { plan: "free" });
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "user-1" });
  });
});

describe("resetUser", () => {
  it("forgets the user in both tools", () => {
    resetUser();
    expect(posthog.reset).toHaveBeenCalled();
    expect(sentry.setUser).toHaveBeenCalledWith(null);
  });
});

describe("track", () => {
  it("captures typed events only when PostHog is loaded", () => {
    track("login_completed", { method: "google" });
    expect(posthog.capture).toHaveBeenCalledWith("login_completed", { method: "google" });
    posthog.__loaded = false;
    track("login_completed", { method: "google" });
    expect(posthog.capture).toHaveBeenCalledTimes(1);
  });
});
