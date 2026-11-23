import { describe, expect, it } from "vitest";
import { groupByWave, regionLabel, type CountryRow } from "./countries";

const rows: CountryRow[] = [
  { country_code: "VN", region: "SEA", launch_wave: 2, is_enabled: false },
  { country_code: "IN", region: "IN", launch_wave: 1, is_enabled: true },
  { country_code: "CN", region: "EA", launch_wave: null, is_enabled: false },
  { country_code: "NP", region: "SA", launch_wave: 1, is_enabled: true },
  { country_code: "PH", region: "SEA", launch_wave: 2, is_enabled: true },
];

describe("groupByWave", () => {
  const groups = groupByWave(rows, new Map([["VN", 12], ["PH", 3]]));

  it("orders waves, with unscheduled countries last", () => {
    expect(groups.map((g) => g.title)).toEqual(["Wave 1", "Wave 2", "Not scheduled"]);
  });

  it("sorts countries by name and counts the enabled ones", () => {
    expect(groups[0]!.countries.map((c) => c.name)).toEqual(["India", "Nepal"]);
    expect(groups[0]!.enabled).toBe(2);
    expect(groups[1]!.countries.map((c) => c.country_code)).toEqual(["PH", "VN"]);
    expect(groups[1]!.enabled).toBe(1);
  });

  it("adds the waitlist count (0 when nobody is waiting)", () => {
    expect(groups[1]!.countries.map((c) => c.waiting)).toEqual([3, 12]);
    expect(groups[0]!.countries[0]!.waiting).toBe(0);
  });

  it("handles no countries", () => {
    expect(groupByWave([], new Map())).toEqual([]);
  });
});

describe("regionLabel", () => {
  it("names market regions", () => {
    expect(regionLabel("SEA")).toBe("South-East Asia");
    expect(regionLabel("ANZ")).toBe("Australia & NZ");
  });
});
