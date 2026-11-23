import { describe, expect, it } from "vitest";
import {
  dashboardModules,
  examCountdown,
  firstName,
  greeting,
  hourIn,
  planLabel,
  recommendedModule,
  testTypeLabel,
  type DashboardModule,
} from "./dashboard";

describe("modules", () => {
  it("lists the four IELTS modules in exam order, all coming soon for now", () => {
    expect(dashboardModules.map((m) => m.key)).toEqual(["reading", "listening", "writing", "speaking"]);
    expect(dashboardModules.every((m) => m.status === "soon" && !m.href)).toBe(true);
  });

  it("recommends the first available module, none while all are coming soon", () => {
    expect(recommendedModule(dashboardModules)).toBeNull();
    const withWriting: DashboardModule[] = dashboardModules.map((m) =>
      m.key === "writing" ? { ...m, status: "available", href: "/app/writing" } : m,
    );
    expect(recommendedModule(withWriting)).toBe("writing");
  });
});

describe("greeting", () => {
  it.each([
    [5, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [0, "Good evening"],
    [4, "Good evening"],
    [null, "Welcome back"],
  ])("hour %s → %s", (hour, text) => {
    expect(greeting(hour)).toBe(text);
  });

  it("reads the hour in the student's time zone", () => {
    const now = new Date("2026-11-23T03:00:00Z");
    expect(hourIn("Asia/Kolkata", now)).toBe(8); // +5:30
    expect(hourIn("UTC", now)).toBe(3);
    expect(hourIn(null, now)).toBeNull();
    expect(hourIn("Not/AZone", now)).toBeNull();
  });
});

describe("firstName", () => {
  it("takes the first word, or the part before @", () => {
    expect(firstName("Asha Rao")).toBe("Asha");
    expect(firstName("ravi.k@example.com")).toBe("ravi.k");
    expect(firstName("Priya")).toBe("Priya");
  });
});

describe("examCountdown", () => {
  const today = "2026-11-23";
  it("counts days to an upcoming exam", () => {
    expect(examCountdown("2026-11-24", today)).toEqual({ kind: "upcoming", days: 1 });
    expect(examCountdown("2027-01-23", today)).toEqual({ kind: "upcoming", days: 61 });
  });

  it("handles exam day, a passed date and no date", () => {
    expect(examCountdown("2026-11-23", today)).toEqual({ kind: "today" });
    expect(examCountdown("2026-11-01", today)).toEqual({ kind: "past" });
    expect(examCountdown(null, today)).toEqual({ kind: "none" });
  });
});

describe("labels", () => {
  it("names test types and plans", () => {
    expect(testTypeLabel("academic")).toBe("Academic");
    expect(testTypeLabel("general")).toBe("General Training");
    expect(testTypeLabel(null)).toBeNull();
    expect(planLabel("gold")).toBe("Gold");
    expect(planLabel(null)).toBe("Free");
  });
});
