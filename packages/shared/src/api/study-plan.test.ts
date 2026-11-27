import { describe, expect, it } from "vitest";
import { AssignedPlan, MyStudyPlan, NextPick, STUDY_ITEM_KINDS, itemsLeft, planPercent, studyItemKinds } from "./study-plan";

const id = "5a100000-0000-4000-8000-000000000001";

describe("study plan contracts", () => {
  it("NextPick: an item or null", () => {
    expect(NextPick.parse(null)).toBeNull();
    expect(NextPick.parse({ kind: "reading_test", item_id: id, title: "R", extra: {}, done_before: false })).toMatchObject({ kind: "reading_test" });
    expect(NextPick.safeParse({ kind: "writing_full", item_id: id, title: "W", extra: {}, done_before: false }).success).toBe(false);
  });
  it("AssignedPlan never carries the template", () => {
    const parsed = AssignedPlan.parse({ started_on: "2026-11-27", days: 14, new: true, template_id: id, name: "Balanced" });
    expect(parsed).toEqual({ started_on: "2026-11-27", days: 14, new: true });
  });
  it("MyStudyPlan: inactive, or today's items, the week and progress", () => {
    expect(MyStudyPlan.parse({ active: false })).toEqual({ active: false });
    const plan = MyStudyPlan.parse({
      active: true,
      started_on: "2026-11-25",
      today: "2026-11-27",
      day: 3,
      days: 14,
      items: [
        { day: 1, order: 2, kind: "speaking_p1", item_id: null, title: null, extra: null, done: false, carried: true },
        { day: 3, order: 1, kind: "writing_t2", item_id: id, title: "Essay", extra: { task_no: 2 }, done: true, carried: false },
      ],
      week: [{ day: 4, kinds: ["reading_test", "speaking_p2"] }],
      progress: { done: 3, total: 28 },
      finished: false,
    });
    expect(plan.active && plan.items).toHaveLength(2);
    expect(plan.active && itemsLeft(plan.items)).toBe(1);
  });
  it("every kind has a label and a module", () => {
    for (const k of STUDY_ITEM_KINDS) expect(studyItemKinds[k].label).toBeTruthy();
    expect(studyItemKinds.speaking_full.module).toBe("speaking");
  });
  it("planPercent", () => {
    expect(planPercent({ done: 7, total: 28 })).toBe(25);
    expect(planPercent({ done: 0, total: 0 })).toBe(0);
    expect(planPercent({ done: 30, total: 28 })).toBe(100);
  });
});
