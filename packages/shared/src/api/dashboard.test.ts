import { describe, expect, it } from "vitest";
import { DashboardStats, type DayStats, type ModuleStats, estimatedBand, practiceShares, totalPractice, weekSummary } from "./dashboard";

const mod = (module: ModuleStats["module"], count: number, recent: number | null, latest = recent): ModuleStats => ({
  module,
  count,
  latest_band: latest,
  recent_band: recent,
});
const modules = [mod("reading", 6, 6.3, 7.5), mod("listening", 0, null), mod("writing", 1, 6.5), mod("speaking", 3, 6)];

function days(counts: number[], bands: (number | null)[] = []): DayStats[] {
  return counts.map((count, i) => ({
    date: `2026-11-${String(14 + i).padStart(2, "0")}`,
    count,
    average_band: bands[i] ?? (count ? 6 : null),
  }));
}

describe("DashboardStats contract", () => {
  it("accepts what get_my_dashboard returns and rejects bad shapes", () => {
    const ok = { timezone: "UTC", today: "2026-11-27", modules, days: days(Array(14).fill(0)) };
    expect(DashboardStats.parse(ok)).toEqual(ok);
    expect(DashboardStats.safeParse({ ...ok, modules: modules.slice(0, 3) }).success).toBe(false);
    expect(DashboardStats.safeParse({ ...ok, days: ok.days.slice(1) }).success).toBe(false);
    expect(DashboardStats.safeParse({ ...ok, modules: [{ ...modules[0], recent_band: 9.5 }, ...modules.slice(1)] }).success).toBe(false);
  });
});

describe("estimatedBand", () => {
  it("IELTS-rounds the mean of the practised modules' recent bands", () => {
    // (6.3 + 6.5 + 6) / 3 = 6.27 → 6.5
    expect(estimatedBand(modules)).toEqual({ band: 6.5, from: 3 });
    expect(estimatedBand([mod("reading", 2, 6.2)])).toEqual({ band: 6, from: 1 });
  });
  it("null before any band", () => {
    expect(estimatedBand([mod("reading", 0, null), mod("writing", 0, null)])).toBeNull();
  });
});

describe("practice totals and shares", () => {
  it("adds up the counts", () => {
    expect(totalPractice(modules)).toBe(10);
  });
  it("whole percents that always add up to 100", () => {
    expect(practiceShares(modules)).toEqual({ reading: 60, listening: 0, writing: 10, speaking: 30 });
    const thirds = practiceShares([mod("reading", 1, 6), mod("listening", 1, 6), mod("writing", 1, 6), mod("speaking", 0, null)]);
    expect(Object.values(thirds).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("all zero without practice", () => {
    expect(practiceShares([mod("reading", 0, null)])).toEqual({ reading: 0, listening: 0, writing: 0, speaking: 0 });
  });
});

describe("weekSummary", () => {
  it("splits the 14 days into last week and this week, and compares them", () => {
    const s = weekSummary(days([1, 0, 0, 0, 1, 0, 2, /* this week → */ 0, 1, 2, 0, 1, 1, 1], [6, null, null, null, 7, null, 5.5]));
    expect(s.lastWeek.map((d) => d.date)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(s.thisWeek.at(-1)!.date).toBe("2026-11-27");
    expect(s.lastWeekCount).toBe(4);
    expect(s.thisWeekCount).toBe(6);
    expect(s.change).toBe(50);
    // Weighted by count: (6·1 + 7·1 + 5.5·2) / 4 = 6
    expect(s.lastWeekBand).toBe(6);
    expect(s.thisWeekBand).toBe(6);
  });
  it("no change figure when last week was empty; no band without practice", () => {
    const s = weekSummary(days([...Array(7).fill(0), 0, 0, 0, 0, 0, 0, 2]));
    expect(s.change).toBeNull();
    expect(s.lastWeekBand).toBeNull();
    expect(s.thisWeekCount).toBe(2);
  });
});
