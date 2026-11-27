import { describe, expect, it } from "vitest";
import {
  addHighlight,
  attemptSummary,
  clock,
  durationText,
  listFilter,
  parseReadingDraft,
  planAllows,
  removeHighlightAt,
  resultsByPassage,
  secondsLeft,
  TEST_SECONDS,
  timerTone,
} from "./reading";

describe("test list (M4-F1)", () => {
  it("filters by the chosen type, else the student's own, else all", () => {
    expect(listFilter("general", "academic")).toBe("general");
    expect(listFilter("all", "academic")).toBe("all");
    expect(listFilter(undefined, "academic")).toBe("academic");
    expect(listFilter("nonsense", null)).toBe("all");
    expect(listFilter(["general", "academic"], null)).toBe("general");
  });

  it("plans unlock their tier and below", () => {
    expect(planAllows("free", "free")).toBe(true);
    expect(planAllows("free", "gold")).toBe(false);
    expect(planAllows("gold", "gold")).toBe(true);
    expect(planAllows("platinum", "gold")).toBe(true);
    expect(planAllows(null, "free")).toBe(true);
  });

  it("summarises attempts per test (rows newest first)", () => {
    const rows = [
      { id: "3", test_id: "a", band: 6.5, raw_score: 25, created_at: "2026-11-24" },
      { id: "2", test_id: "b", band: 5, raw_score: 15, created_at: "2026-11-23" },
      { id: "1", test_id: "a", band: 7, raw_score: 30, created_at: "2026-11-22" },
    ];
    const s = attemptSummary(rows);
    expect(s.get("a")).toMatchObject({ count: 2, best: 7, latest: { id: "3" } });
    expect(s.get("b")).toMatchObject({ count: 1, best: 5 });
  });
});

describe("timer (M4-F2)", () => {
  const t0 = 1_000_000;
  it("counts 60 minutes down from the start and stops at 0", () => {
    expect(secondsLeft(t0, t0)).toBe(TEST_SECONDS);
    expect(secondsLeft(t0, t0 + 61_000)).toBe(3539);
    expect(secondsLeft(t0, t0 + 3_600_000)).toBe(0);
    expect(secondsLeft(t0, t0 + 9_999_999)).toBe(0);
  });

  it("warns at 10 minutes, urgent at 5", () => {
    expect(timerTone(601)).toBe("normal");
    expect(timerTone(600)).toBe("warn");
    expect(timerTone(300)).toBe("urgent");
    expect(timerTone(0)).toBe("urgent");
  });

  it("formats the clock and durations", () => {
    expect(clock(3600)).toBe("60:00");
    expect(clock(599)).toBe("09:59");
    expect(clock(-3)).toBe("00:00");
    expect(durationText(1500)).toBe("25 min");
    expect(durationText(30)).toBe("under a minute");
    expect(durationText(null)).toBeNull();
  });
});

describe("highlights (M4-F2)", () => {
  it("adds, merges overlapping or touching ranges, and ignores empty ones", () => {
    let r = addHighlight([], [10, 20]);
    r = addHighlight(r, [30, 40]);
    expect(r).toEqual([[10, 20], [30, 40]]);
    expect(addHighlight(r, [15, 35])).toEqual([[10, 40]]);
    expect(addHighlight(r, [20, 25])).toEqual([[10, 25], [30, 40]]);
    expect(addHighlight(r, [5, 5])).toEqual(r);
    expect(addHighlight([], [8, 3])).toEqual([[3, 8]]); // selected backwards
  });

  it("removes the highlight that was tapped", () => {
    expect(removeHighlightAt([[10, 20], [30, 40]], 12)).toEqual([[30, 40]]);
    expect(removeHighlightAt([[10, 20]], 25)).toEqual([[10, 20]]);
  });
});

describe("draft (M4-F2 autosave)", () => {
  const now = 10_000_000;
  it("restores answers, highlights and the start time; drops anything malformed", () => {
    const raw = JSON.stringify({
      startedAt: now - 60_000,
      answers: { "1": "true", "20": ["A", "C"], "41": "x" },
      highlights: { p1: [[0, 5], [9, 3], "x"], p2: "nope" },
    });
    expect(parseReadingDraft(raw, now)).toEqual({ startedAt: now - 60_000, answers: { "1": "true", "20": ["A", "C"] }, highlights: { p1: [[0, 5]] } });
  });

  it("ignores missing, broken, future or day-old drafts", () => {
    expect(parseReadingDraft(null, now)).toBeNull();
    expect(parseReadingDraft("{", now)).toBeNull();
    expect(parseReadingDraft(JSON.stringify({ startedAt: now + 1 }), now)).toBeNull();
    expect(parseReadingDraft(JSON.stringify({ startedAt: now - 25 * 3600 * 1000 }), now)).toBeNull();
  });
});

describe("results by passage (M4-F4)", () => {
  const r = (q_no: number, correct = true) => ({
    q_no,
    q_type: "tfng" as const,
    correct,
    given: "true",
    correct_answer: "true",
    also_accepted: [],
    note: null,
    explanation: null,
  });
  it("groups in passage order; questions no longer in the test go last", () => {
    const passages = [
      { id: "p2", order_no: 2 },
      { id: "p1", order_no: 1 },
    ];
    const questions = [
      { q_no: 1, passage_id: "p1" },
      { q_no: 2, passage_id: "p2" },
    ];
    const groups = resultsByPassage([r(2), r(9), r(1)], questions, passages);
    expect(groups.map((g) => [g.passage?.id ?? null, g.results.map((x) => x.q_no)])).toEqual([
      ["p1", [1]],
      ["p2", [2]],
      [null, [9]],
    ]);
    // Without the test (withdrawn): one plain list.
    expect(resultsByPassage([r(1)], [], [])).toEqual([{ passage: null, results: [r(1)] }]);
  });
});
