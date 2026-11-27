// Raw score → band conversion for Reading (M4-C2). Pure, unit-tested; grade-test (M4-B2) has a
// copy kept in sync by tests/contract.test.ts.
//
// The tables are the commonly published IELTS Reading conversions for a 40-question test.
// IELTS adjusts the exact boundaries per test version, so these are a practice estimate, which
// is how the app presents the band. The published tables stop at 2.5; the rows below that are
// our extension so every raw score has a band.
import type { Database } from "../db";

export type TestType = Database["public"]["Enums"]["ielts_test_type"];

/** [lowest raw score, band], highest first. A raw score gets the band of the first row it reaches. */
type BandTable = readonly (readonly [minRaw: number, band: number])[];

export const READING_BANDS: Record<TestType, BandTable> = {
  academic: [
    [39, 9],
    [37, 8.5],
    [35, 8],
    [33, 7.5],
    [30, 7],
    [27, 6.5],
    [23, 6],
    [19, 5.5],
    [15, 5],
    [13, 4.5],
    [10, 4],
    [8, 3.5],
    [6, 3],
    [4, 2.5],
    // Below the published table.
    [2, 2],
    [1, 1],
    [0, 0],
  ],
  general: [
    [40, 9],
    [39, 8.5],
    [37, 8],
    [36, 7.5],
    [34, 7],
    [32, 6.5],
    [30, 6],
    [27, 5.5],
    [23, 5],
    [19, 4.5],
    [15, 4],
    [12, 3.5],
    [9, 3],
    [6, 2.5],
    // Below the published table.
    [3, 2],
    [1, 1],
    [0, 0],
  ],
};

export const FULL_TEST_QUESTIONS = 40;

/**
 * Practice tests can have fewer than 40 questions (e.g. the seeded samples). The score is scaled
 * to 40 first, rounding down so a short test never flatters: 10/14 → 28/40.
 */
export function scaledRawScore(raw: number, total: number): number {
  if (!Number.isInteger(raw) || !Number.isInteger(total) || total < 1 || raw < 0 || raw > total) {
    throw new RangeError(`invalid score ${raw}/${total}`);
  }
  return total === FULL_TEST_QUESTIONS ? raw : Math.floor((raw * FULL_TEST_QUESTIONS) / total);
}

/** Band (0–9, whole or half) for a Reading raw score out of `total` questions. */
export function readingBand(testType: TestType, raw: number, total: number = FULL_TEST_QUESTIONS): number {
  const scaled = scaledRawScore(raw, total);
  const row = READING_BANDS[testType].find(([min]) => scaled >= min);
  return row ? row[1] : 0;
}

// ── IELTS rounding (M8-C2) ──────────────────────────────────────────────────────────────────
/**
 * Rounds an average to a reported IELTS band, the way IELTS rounds an overall band: to the nearest
 * half band, with the quarters going UP. The fraction decides:
 *   < .25 → down to the whole band (6.1 → 6, 6.24 → 6)
 *   .25 to < .75 → .5               (6.25 → 6.5, 6.5 → 6.5, 6.74 → 6.5)
 *   ≥ .75 → up to the next band     (6.75 → 7)
 * Used for the Speaking test's overall band (the average of Parts 1–3, M8-B3) and any overall band.
 * Averages of half bands are exact in binary, but a mean like (6.5+6+6.5)/3 isn't, so the value is
 * snapped to 1e-9 first: 6.2499999999 counts as 6.25.
 */
export function ieltsRound(average: number): number {
  if (!Number.isFinite(average) || average < 0 || average > 9) throw new RangeError(`not a band average: ${average}`);
  const v = Math.round(average * 1e9) / 1e9;
  const whole = Math.floor(v);
  const frac = v - whole;
  if (frac < 0.25) return whole;
  if (frac < 0.75) return whole + 0.5;
  return whole + 1;
}

/** The IELTS-rounded mean of several bands (e.g. the three Speaking parts). */
export function overallBand(bands: readonly number[]): number {
  if (!bands.length) throw new RangeError("no bands to average");
  return ieltsRound(bands.reduce((a, b) => a + b, 0) / bands.length);
}
