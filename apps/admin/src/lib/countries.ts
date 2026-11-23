// Country waves page helpers (M2-A2). Pure, unit-tested.
import type { Tables } from "@prepora/shared/db";
import { countryName } from "./users";

export type CountryRow = Pick<Tables<"country_regions">, "country_code" | "region" | "launch_wave" | "is_enabled">;

const regionLabels: Record<CountryRow["region"], string> = {
  IN: "India",
  SA: "South Asia",
  SEA: "South-East Asia",
  EA: "East Asia",
  ANZ: "Australia & NZ",
};

export function regionLabel(region: CountryRow["region"]): string {
  return regionLabels[region] ?? region;
}

export type WaveGroup = {
  /** null = not scheduled yet. */
  wave: number | null;
  title: string;
  countries: (CountryRow & { name: string; waiting: number })[];
  enabled: number;
};

/**
 * Countries grouped by launch wave (1, 2, …, then "Not scheduled"), each sorted by name, with how
 * many people are waiting there.
 */
export function groupByWave(rows: readonly CountryRow[], waiting: ReadonlyMap<string, number>): WaveGroup[] {
  const groups = new Map<number | null, WaveGroup>();
  for (const row of rows) {
    const wave = row.launch_wave ?? null;
    let group = groups.get(wave);
    if (!group) {
      group = { wave, title: wave === null ? "Not scheduled" : `Wave ${wave}`, countries: [], enabled: 0 };
      groups.set(wave, group);
    }
    group.countries.push({ ...row, name: countryName(row.country_code), waiting: waiting.get(row.country_code) ?? 0 });
    if (row.is_enabled) group.enabled += 1;
  }
  for (const g of groups.values()) g.countries.sort((a, b) => a.name.localeCompare(b.name));
  return [...groups.values()].sort((a, b) => (a.wave ?? Infinity) - (b.wave ?? Infinity));
}
