import { describe, expect, it } from "vitest";
import {
  bandTrend,
  correctionSegments,
  EMPTY_DRAFT,
  parseWritingDraft,
  recentAverage,
  taskKindLabel,
  taskSeconds,
  tasksFor,
  taskSummary,
  timeLeft,
  writingClock,
  writingTimerTone,
} from "./writing";

const task = (id: string, task_no: number, test_type: "academic" | "general" | null) => ({ id, task_no, test_type, title: id });

describe("tasksFor", () => {
  const tasks = [task("a1", 1, "academic"), task("g1", 1, "general"), task("e", 2, null), task("eg", 2, "general")];
  it("Task 1 follows the test type; Task 2 essays for both always show", () => {
    expect(tasksFor(tasks, "academic")).toEqual({ task1: [tasks[0]], task2: [tasks[2]] });
    expect(tasksFor(tasks, "general")).toEqual({ task1: [tasks[1]], task2: [tasks[2], tasks[3]] });
    expect(tasksFor(tasks, "all")).toEqual({ task1: [tasks[0], tasks[1]], task2: [tasks[2], tasks[3]] });
  });
  it("labels and time limits", () => {
    expect(taskKindLabel(1, "academic")).toBe("Task 1 · Academic report");
    expect(taskKindLabel(1, "general")).toBe("Task 1 · General letter");
    expect(taskKindLabel(2, null)).toBe("Task 2 · Essay");
    expect([taskSeconds(1), taskSeconds(2)]).toEqual([1200, 2400]);
  });
});

describe("timer", () => {
  it("counts down, then up when over time", () => {
    const start = 1_000_000;
    expect(timeLeft(start, start, 2400)).toBe(2400);
    expect(timeLeft(start, start + 1500, 2400)).toBe(2399);
    expect(timeLeft(start, start + 2_533_000, 2400)).toBe(-133);
    expect(timeLeft(start, start - 900, 2400)).toBe(2400); // `now` read just before the start
    expect(writingClock(2400)).toBe("40:00");
    expect(writingClock(59)).toBe("00:59");
    expect(writingClock(0)).toBe("00:00");
    expect(writingClock(-133)).toBe("+02:13");
    expect([writingTimerTone(301), writingTimerTone(300), writingTimerTone(0), writingTimerTone(-1)]).toEqual(["normal", "warn", "warn", "over"]);
  });
});

describe("parseWritingDraft", () => {
  it("reads a saved draft and repairs what it can", () => {
    expect(parseWritingDraft(null)).toBeNull();
    expect(parseWritingDraft("not json")).toBeNull();
    expect(parseWritingDraft(JSON.stringify({ text: 5 }))).toBeNull();
    expect(parseWritingDraft(JSON.stringify({ text: "Hi", startedAt: 5 }))).toEqual({ ...EMPTY_DRAFT, text: "Hi", startedAt: 5 });
    const photo = { text: "Read", startedAt: null, mode: "photo", photoPaths: ["u/1.jpg", "u/2.jpg", "u/3.jpg", 7] };
    expect(parseWritingDraft(JSON.stringify(photo))).toEqual({ startedAt: null, text: "Read", mode: "photo", photoPaths: ["u/1.jpg", "u/2.jpg"] });
    // Photo mode without photos falls back to typed.
    expect(parseWritingDraft(JSON.stringify({ text: "x", mode: "photo", photoPaths: [] }))?.mode).toBe("typed");
    expect(parseWritingDraft(JSON.stringify({ text: "a".repeat(20_001) }))).toBeNull();
  });
});

describe("correctionSegments", () => {
  const text = "Many peoples thinks that alot of peoples are wrong.";
  it("marks the first occurrence of each correction, in text order", () => {
    expect(correctionSegments(text, [{ original: "peoples" }, { original: "alot" }])).toEqual([
      { text: "Many " },
      { text: "peoples", correction: 0 },
      { text: " thinks that " },
      { text: "alot", correction: 1 },
      { text: " of peoples are wrong." },
    ]);
  });
  it("a correction overlapping an earlier one moves to its next occurrence, or is skipped", () => {
    const segs = correctionSegments(text, [{ original: "peoples thinks" }, { original: "peoples" }, { original: "thinks" }, { original: "missing" }]);
    expect(segs.filter((s) => s.correction !== undefined)).toEqual([
      { text: "peoples thinks", correction: 0 },
      { text: "peoples", correction: 1 },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
  });
  it("no corrections: the text as one segment", () => {
    expect(correctionSegments("Fine.", [])).toEqual([{ text: "Fine." }]);
    expect(correctionSegments("", [{ original: "x" }])).toEqual([]);
  });
});

describe("history", () => {
  const rows = [
    { id: "c", task_id: "t2", band: "6.5", created_at: "2026-11-20T10:00:00Z" },
    { id: "a", task_id: "t1", band: 5, created_at: "2026-11-01T10:00:00Z" },
    { id: "b", task_id: "t1", band: "6.0", created_at: "2026-11-10T10:00:00Z" },
  ];
  it("trend oldest first, limited to the last points", () => {
    expect(bandTrend(rows)).toEqual([
      { id: "a", band: 5, at: "2026-11-01T10:00:00Z" },
      { id: "b", band: 6, at: "2026-11-10T10:00:00Z" },
      { id: "c", band: 6.5, at: "2026-11-20T10:00:00Z" },
    ]);
    expect(bandTrend(rows, 2).map((p) => p.id)).toEqual(["b", "c"]);
  });
  it("per-task count and best band; recent average", () => {
    expect(taskSummary(rows).get("t1")).toEqual({ count: 2, best: 6 });
    expect(recentAverage(rows)).toBe(5.8);
    expect(recentAverage(rows, 2)).toBe(6.3);
    expect(recentAverage([])).toBeNull();
  });
});

describe("Task 1 / Task 2 pages", () => {
  it("taskNote: Task 1 follows the test type; Task 2 is the same for both", async () => {
    const { taskNote } = await import("./writing");
    expect(taskNote(1, "academic")).toMatch(/report on a chart/);
    expect(taskNote(1, "general")).toMatch(/^A letter/);
    expect(taskNote(1, "all")).toMatch(/report \(Academic\) or a letter/);
    expect(taskNote(2, "general")).toBe(taskNote(2, "academic"));
  });
  it("writingTaskListPath keeps the filter", async () => {
    const { writingTaskListPath } = await import("../routes");
    expect(writingTaskListPath(1)).toBe("/app/writing/tasks/1");
    expect(writingTaskListPath(2, "general")).toBe("/app/writing/tasks/2?type=general");
  });
});
