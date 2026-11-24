// Reading frontend (M4-F1..F4): the test list, the player's timer, drafts and highlights, and the
// results page. Pure, unit-tested (reading.test.ts).
import type { QuestionResult } from "@prepora/shared/api/grade-test";
import type { TestType } from "@prepora/shared/ielts/bands";
import { plans } from "@prepora/shared/types/profile";
import type { Answers } from "./questions";
import { parseDraft } from "./questions";

// ── Test list (M4-F1) ───────────────────────────────────────────────────────────────────────
/** ?type=academic|general|all; anything else falls back to the student's own test type, then all. */
export function listFilter(param: string | string[] | undefined, profileType: TestType | null | undefined): TestType | "all" {
  const v = Array.isArray(param) ? param[0] : param;
  if (v === "academic" || v === "general" || v === "all") return v;
  return profileType ?? "all";
}

/** Can this plan take a test that needs `minPlan`? (Same order as plan_rank() in the database.) */
export function planAllows(plan: string | null | undefined, minPlan: string): boolean {
  const rank = (p: string) => (plans as readonly string[]).indexOf(p);
  return rank(plan || "free") >= rank(minPlan);
}

export type AttemptRow = { id: string; test_id: string; band: number; raw_score: number; created_at: string };

/** Per test: how many attempts, the best band and the latest attempt (rows newest first). */
export function attemptSummary(rows: readonly AttemptRow[]): Map<string, { count: number; best: number; latest: AttemptRow }> {
  const map = new Map<string, { count: number; best: number; latest: AttemptRow }>();
  for (const r of rows) {
    const s = map.get(r.test_id);
    if (!s) map.set(r.test_id, { count: 1, best: Number(r.band), latest: r });
    else {
      s.count++;
      s.best = Math.max(s.best, Number(r.band));
    }
  }
  return map;
}

// ── Timer (M4-F2) ───────────────────────────────────────────────────────────────────────────
/** The Reading test is 60 minutes. */
export const TEST_SECONDS = 60 * 60;

/** Seconds left, never below 0. The clock keeps running across reloads (it's based on startedAt). */
export function secondsLeft(startedAt: number, now: number, limit = TEST_SECONDS): number {
  return Math.max(0, Math.ceil(limit - (now - startedAt) / 1000));
}

/** Normal; "warn" in the last 10 minutes; "urgent" in the last 5 (as the invigilator announces). */
export function timerTone(left: number): "normal" | "warn" | "urgent" {
  if (left <= 5 * 60) return "urgent";
  if (left <= 10 * 60) return "warn";
  return "normal";
}

/** 3599 → "59:59". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** 1500 → "25 min", 59 → "under a minute". */
export function durationText(seconds: number | null | undefined): string | null {
  if (seconds == null) return null;
  if (seconds < 60) return "under a minute";
  return `${Math.round(seconds / 60)} min`;
}

// ── Highlights (M4-F2) ──────────────────────────────────────────────────────────────────────
/** [start, end) character offsets into a passage body. Sorted, never overlapping. */
export type Range = readonly [start: number, end: number];

/** Add a highlight, merging it with any it touches or overlaps. Empty ranges are ignored. */
export function addHighlight(ranges: readonly Range[], add: Range): Range[] {
  let [s, e] = add[0] <= add[1] ? add : ([add[1], add[0]] as const);
  if (s === e) return [...ranges];
  const out: Range[] = [];
  for (const r of ranges) {
    if (r[1] < s || r[0] > e) out.push(r);
    else {
      s = Math.min(s, r[0]);
      e = Math.max(e, r[1]);
    }
  }
  out.push([s, e]);
  return out.sort((a, b) => a[0] - b[0]);
}

/** Remove the highlight containing this offset (tapping a highlight clears it). */
export function removeHighlightAt(ranges: readonly Range[], offset: number): Range[] {
  return ranges.filter((r) => !(offset >= r[0] && offset < r[1]));
}

/** The text cut into plain and highlighted pieces, with each piece's starting offset. */
export function segments(text: string, ranges: readonly Range[]): { text: string; start: number; marked: boolean }[] {
  const out: { text: string; start: number; marked: boolean }[] = [];
  let at = 0;
  for (const [s0, e0] of ranges) {
    const s = Math.max(at, Math.min(s0, text.length));
    const e = Math.min(e0, text.length);
    if (e <= s) continue;
    if (s > at) out.push({ text: text.slice(at, s), start: at, marked: false });
    out.push({ text: text.slice(s, e), start: s, marked: true });
    at = e;
  }
  if (at < text.length) out.push({ text: text.slice(at), start: at, marked: false });
  return out;
}

// ── Draft (autosave, M4-F2) ─────────────────────────────────────────────────────────────────
export type ReadingDraft = { startedAt: number; answers: Answers; highlights: Record<string, Range[]> };

export const readingDraftKey = (testId: string) => `prepora:reading:${testId}`;

/** A saved draft, or null when there's none, it's malformed, or its time ran out long ago. */
export function parseReadingDraft(raw: string | null, now: number): ReadingDraft | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ReadingDraft>;
    if (typeof v.startedAt !== "number" || v.startedAt > now) return null;
    // A day after it started, it's abandoned: start afresh.
    if (now - v.startedAt > 24 * 3600 * 1000) return null;
    const highlights: Record<string, Range[]> = {};
    if (v.highlights && typeof v.highlights === "object") {
      for (const [k, list] of Object.entries(v.highlights)) {
        if (!Array.isArray(list)) continue;
        highlights[k] = list.filter(
          (r): r is Range => Array.isArray(r) && r.length === 2 && Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= 0 && r[0] < r[1],
        );
      }
    }
    return { startedAt: v.startedAt, answers: parseDraft(JSON.stringify(v.answers ?? {})), highlights };
  } catch {
    return null;
  }
}

// ── Results (M4-F4) ─────────────────────────────────────────────────────────────────────────
/** Results grouped by passage (in passage order); results for unknown questions go last. */
export function resultsByPassage<P extends { id: string; order_no: number }>(
  results: readonly QuestionResult[],
  questions: readonly { q_no: number; passage_id: string }[],
  passages: readonly P[],
): { passage: P | null; results: QuestionResult[] }[] {
  const passageOf = new Map(questions.map((q) => [q.q_no, q.passage_id]));
  const groups = [...passages].sort((a, b) => a.order_no - b.order_no).map((p) => ({ passage: p as P | null, results: [] as QuestionResult[] }));
  const rest: QuestionResult[] = [];
  for (const r of [...results].sort((a, b) => a.q_no - b.q_no)) {
    const g = groups.find((x) => x.passage?.id === passageOf.get(r.q_no));
    (g ? g.results : rest).push(r);
  }
  return [...groups.filter((g) => g.results.length), ...(rest.length ? [{ passage: null, results: rest }] : [])];
}
