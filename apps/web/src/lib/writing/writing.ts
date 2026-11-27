// Writing screens (M6-F1..F4): pure helpers, unit-tested; the pages and components render what
// they return. The scoring rules themselves (word count, band) come from @prepora/shared.
import type { WritingCorrection } from "@prepora/shared/api/score-writing";
import { WRITING_TASKS, type WritingTaskNo } from "@prepora/shared/ielts/writing";
import type { TestType } from "@prepora/shared/types/profile";

// ── Tasks ───────────────────────────────────────────────────────────────────────────────────
export type TaskRow = { id: string; task_no: number; test_type: TestType | null; title: string };

/**
 * The tasks for a filter: Task 1 differs by test (Academic report, General letter), so it follows
 * the filter; Task 2 essays with no test type suit both and always show.
 */
export function tasksFor<T extends TaskRow>(tasks: readonly T[], filter: TestType | "all"): { task1: T[]; task2: T[] } {
  const fits = (t: T) => filter === "all" || t.test_type === null || t.test_type === filter;
  return {
    task1: tasks.filter((t) => t.task_no === 1 && fits(t)),
    task2: tasks.filter((t) => t.task_no === 2 && fits(t)),
  };
}

/** What each task is, for the chosen test type (Writing home and the task pages). */
export function taskNote(taskNo: 1 | 2, filter: TestType | "all"): string {
  if (taskNo === 2) return "An essay, 250 words, 40 minutes. The same for both tests.";
  if (filter === "general") return "A letter, 150 words, 20 minutes.";
  if (filter === "academic") return "A report on a chart or diagram, 150 words, 20 minutes.";
  return "A report (Academic) or a letter (General Training), 150 words, 20 minutes.";
}

/** "Task 1 · Academic report", "Task 1 · General letter", "Task 2 · Essay". */
export function taskKindLabel(taskNo: number, testType: TestType | null): string {
  if (taskNo === 2) return "Task 2 · Essay";
  return testType === "general" ? "Task 1 · General letter" : "Task 1 · Academic report";
}

export function taskSeconds(taskNo: WritingTaskNo): number {
  return WRITING_TASKS[taskNo].minutes * 60;
}

// ── Timer ───────────────────────────────────────────────────────────────────────────────────
/** Seconds left on the task's clock; negative once over time (the editor keeps counting). */
export function timeLeft(startedAt: number, now: number, limitSeconds: number): number {
  // Never more than the limit: a `now` read just before the clock started would add a second.
  return limitSeconds - Math.max(0, Math.floor((now - startedAt) / 1000));
}

/** "39:59"; over time: "+02:13". */
export function writingClock(secondsLeft: number): string {
  const over = secondsLeft < 0;
  const s = Math.abs(secondsLeft);
  const text = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return over ? `+${text}` : text;
}

/** Last 5 minutes: warn; over time: over. */
export function writingTimerTone(secondsLeft: number): "normal" | "warn" | "over" {
  if (secondsLeft < 0) return "over";
  return secondsLeft <= 300 ? "warn" : "normal";
}

// ── Draft (autosaved on this device) ────────────────────────────────────────────────────────
export type WritingDraft = {
  /** When the clock started; null until the student starts writing. */
  startedAt: number | null;
  text: string;
  mode: "typed" | "photo";
  /** writing-photos paths the text was read from (photo mode). */
  photoPaths: string[];
};

export const writingDraftKey = (taskId: string) => `prepora:writing:${taskId}`;

export const EMPTY_DRAFT: WritingDraft = { startedAt: null, text: "", mode: "typed", photoPaths: [] };

/** A saved draft, or null when there's none or it's unreadable. */
export function parseWritingDraft(raw: string | null): WritingDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<WritingDraft>;
    if (typeof d.text !== "string" || d.text.length > 20_000) return null;
    const startedAt = typeof d.startedAt === "number" && Number.isFinite(d.startedAt) ? d.startedAt : null;
    const photoPaths = Array.isArray(d.photoPaths) ? d.photoPaths.filter((p): p is string => typeof p === "string").slice(0, 2) : [];
    const mode = d.mode === "photo" && photoPaths.length > 0 ? "photo" : "typed";
    return { startedAt, text: d.text, mode, photoPaths: mode === "photo" ? photoPaths : [] };
  } catch {
    return null;
  }
}

// ── Feedback: inline corrections ────────────────────────────────────────────────────────────
export type Segment = { text: string; correction?: number };

/**
 * The answer cut into plain text and highlighted corrections: each correction marks the first
 * occurrence of its `original` that doesn't overlap an earlier one (corrections are in priority
 * order). `correction` is the index in the list, for the numbered note.
 */
export function correctionSegments(text: string, corrections: readonly Pick<WritingCorrection, "original">[]): Segment[] {
  const taken: { start: number; end: number; index: number }[] = [];
  corrections.forEach((c, index) => {
    if (!c.original) return;
    let from = 0;
    for (;;) {
      const start = text.indexOf(c.original, from);
      if (start < 0) return;
      const end = start + c.original.length;
      if (!taken.some((t) => start < t.end && end > t.start)) {
        taken.push({ start, end, index });
        return;
      }
      from = start + 1;
    }
  });
  taken.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let pos = 0;
  for (const t of taken) {
    if (t.start > pos) out.push({ text: text.slice(pos, t.start) });
    out.push({ text: text.slice(t.start, t.end), correction: t.index });
    pos = t.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos) });
  return out;
}

// ── History ─────────────────────────────────────────────────────────────────────────────────
export type SubmissionRow = { id: string; task_id: string; band: number | string; created_at: string };

/** Oldest first, the last `limit` scored answers: the band trend's points. */
export function bandTrend(rows: readonly SubmissionRow[], limit = 12): { id: string; band: number; at: string }[] {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit)
    .map((r) => ({ id: r.id, band: Number(r.band), at: r.created_at }));
}

/** Per task: how many times answered and the best band (task cards). */
export function taskSummary(rows: readonly SubmissionRow[]): Map<string, { count: number; best: number }> {
  const out = new Map<string, { count: number; best: number }>();
  for (const r of rows) {
    const s = out.get(r.task_id) ?? { count: 0, best: 0 };
    out.set(r.task_id, { count: s.count + 1, best: Math.max(s.best, Number(r.band)) });
  }
  return out;
}

/** Average band of the last `n` answers (null with none), for the trend's headline. */
export function recentAverage(rows: readonly SubmissionRow[], n = 5): number | null {
  const last = bandTrend(rows, n);
  if (!last.length) return null;
  return Math.round((last.reduce((s, p) => s + p.band, 0) / last.length) * 10) / 10;
}
