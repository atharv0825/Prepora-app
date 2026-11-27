import { describe, expect, it } from "vitest";
import { Streak, daysBefore, lastDays, lastSevenDays, streakMessage, weekdayIndex } from "./streak";

describe("Streak contract", () => {
  it("accepts what get_my_streak returns and rejects bad shapes", () => {
    const ok = { timezone: "Asia/Kolkata", today: "2026-11-26", current: 3, longest: 5, total_days: 9, practised_today: true, recent: ["2026-11-24", "2026-11-25", "2026-11-26"] };
    expect(Streak.parse(ok)).toEqual(ok);
    expect(Streak.safeParse({ ...ok, current: -1 }).success).toBe(false);
    expect(Streak.safeParse({ ...ok, today: "26/11/2026" }).success).toBe(false);
    expect(Streak.safeParse({ ...ok, recent: Array(84).fill("2026-11-26") }).success).toBe(true);
    expect(Streak.safeParse({ ...ok, recent: Array(121).fill("2026-11-26") }).success).toBe(false);
    expect(Streak.safeParse({ ...ok, total_days: undefined }).success).toBe(false);
  });
});

describe("daysBefore and lastSevenDays", () => {
  it("counts calendar days, across months and leap days", () => {
    expect(daysBefore("2026-12-01", 1)).toBe("2026-11-30");
    expect(daysBefore("2028-03-01", 1)).toBe("2028-02-29");
    expect(daysBefore("2026-11-26", 0)).toBe("2026-11-26");
  });
  it("the 7 days ending today, oldest first, marking practice and today", () => {
    const days = lastSevenDays({ today: "2026-12-02", recent: ["2026-11-27", "2026-12-01", "2026-12-02"] });
    expect(days.map((d) => d.date)).toEqual(["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(days.map((d) => d.practised)).toEqual([false, true, false, false, false, true, true]);
    expect(days.filter((d) => d.today).map((d) => d.date)).toEqual(["2026-12-02"]);
  });
  it("lastDays: 12 weeks for the profile calendar", () => {
    const days = lastDays({ today: "2026-11-27", recent: ["2026-09-05", "2026-11-27"] }, 84);
    expect(days).toHaveLength(84);
    expect(days[0]).toEqual({ date: "2026-09-05", practised: true, today: false });
    expect(days[83]).toEqual({ date: "2026-11-27", practised: true, today: true });
    expect(days.filter((d) => d.practised)).toHaveLength(2);
  });
  it("weekdayIndex: Monday first", () => {
    expect(weekdayIndex("2026-11-23")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-29")).toBe(6); // Sunday
  });
});

describe("streakMessage", () => {
  it("nudges, keeps or celebrates", () => {
    expect(streakMessage({ current: 0, longest: 0, practised_today: false })).toMatch(/start your streak/);
    expect(streakMessage({ current: 0, longest: 4, practised_today: false })).toMatch(/new streak/);
    expect(streakMessage({ current: 3, longest: 5, practised_today: false })).toBe("Practise today to keep your 3-day streak going.");
    expect(streakMessage({ current: 5, longest: 5, practised_today: true })).toMatch(/best streak yet/);
    expect(streakMessage({ current: 1, longest: 1, practised_today: true })).toMatch(/Done for today/);
    expect(streakMessage({ current: 2, longest: 6, practised_today: true })).toMatch(/Done for today/);
  });
});
