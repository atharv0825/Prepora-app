import { describe, expect, it } from "vitest";
import { dayItems, itemsByDay, TemplateForm, templateCoverage } from "./admin-study-plans";

const all = [
  { day: 1, kind: "reading_test" },
  { day: 1, kind: "listening_test" },
  { day: 2, kind: "writing_t1" },
  { day: 2, kind: "writing_t2" },
  { day: 3, kind: "speaking_p1" },
  { day: 3, kind: "speaking_p2" },
] as const;

describe("templateCoverage", () => {
  it("is complete when every kind appears", () => {
    const c = templateCoverage(all, 3);
    expect(c.complete).toBe(true);
    expect(c.missingKinds).toEqual([]);
    expect(c.missingModules).toEqual([]);
    expect(c.counts.reading_test).toBe(1);
    expect(c.emptyDays).toEqual([]);
  });

  it("names the missing kinds and modules, and the empty days", () => {
    const c = templateCoverage(all.filter((i) => !i.kind.startsWith("speaking")), 5);
    expect(c.complete).toBe(false);
    expect(c.missingKinds).toEqual(["speaking_p1", "speaking_p2"]);
    expect(c.missingModules).toEqual(["speaking"]);
    expect(c.emptyDays).toEqual([3, 4, 5]);
  });

  it("doesn't count the retired Speaking full test", () => {
    const c = templateCoverage([...all.filter((i) => i.kind !== "speaking_p2"), { day: 1, kind: "speaking_full" }], 3);
    expect(c.missingKinds).toEqual(["speaking_p2"]);
  });
});

describe("itemsByDay / dayItems", () => {
  it("round-trips, closing gaps in the order", () => {
    const days = itemsByDay(
      [
        { day: 2, order_no: 3, kind: "writing_t2" },
        { day: 1, order_no: 1, kind: "reading_test" },
        { day: 2, order_no: 1, kind: "speaking_p1" },
        { day: 4, order_no: 1, kind: "reading_test" }, // past the plan's days: dropped
        { day: 1, order_no: 2, kind: "speaking_full" }, // retired kind: dropped
      ],
      3,
    );
    expect(days).toEqual([["reading_test"], ["speaking_p1", "writing_t2"], []]);
    expect(dayItems(days)).toEqual([
      { day: 1, order: 1, kind: "reading_test" },
      { day: 2, order: 1, kind: "speaking_p1" },
      { day: 2, order: 2, kind: "writing_t2" },
    ]);
  });
});

describe("TemplateForm", () => {
  const base = { name: "Balanced", days: 3, test_type: null, items: [{ day: 1, order: 1, kind: "reading_test" }] };

  it("accepts a valid template", () => {
    expect(TemplateForm.safeParse(base).success).toBe(true);
  });

  it("rejects items past the last day, duplicate places and the full test", () => {
    expect(TemplateForm.safeParse({ ...base, items: [{ day: 4, order: 1, kind: "reading_test" }] }).success).toBe(false);
    expect(TemplateForm.safeParse({ ...base, items: [{ day: 1, order: 1, kind: "reading_test" }, { day: 1, order: 1, kind: "writing_t1" }] }).success).toBe(false);
    expect(TemplateForm.safeParse({ ...base, items: [{ day: 1, order: 1, kind: "speaking_full" }] }).success).toBe(false);
  });

  it("needs a name and 1–60 days", () => {
    expect(TemplateForm.safeParse({ ...base, name: "  " }).success).toBe(false);
    expect(TemplateForm.safeParse({ ...base, days: 0 }).success).toBe(false);
    expect(TemplateForm.safeParse({ ...base, days: 61 }).success).toBe(false);
  });
});
