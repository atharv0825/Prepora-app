// M8.7: random practice picks and hidden study plans. What pick_next, assign_my_study_plan and
// get_my_study_plan return (supabase/migrations/…_study_plans.sql). Students never see a plan's
// template: no template id or name is part of these shapes.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const STUDY_ITEM_KINDS = [
  "reading_test",
  "listening_test",
  "writing_t1",
  "writing_t2",
  "speaking_p1",
  "speaking_p2",
  "speaking_full",
] as const;
export const StudyItemKind = z.enum(STUDY_ITEM_KINDS);
export type StudyItemKind = z.infer<typeof StudyItemKind>;

/** How each kind reads to a student, and which module it belongs to (its dashboard colour). */
export const studyItemKinds: Record<StudyItemKind, { label: string; module: "reading" | "listening" | "writing" | "speaking" }> = {
  reading_test: { label: "Reading test", module: "reading" },
  listening_test: { label: "Listening test", module: "listening" },
  writing_t1: { label: "Writing Task 1", module: "writing" },
  writing_t2: { label: "Writing Task 2", module: "writing" },
  speaking_p1: { label: "Speaking Part 1", module: "speaking" },
  speaking_p2: { label: "Speaking Part 2", module: "speaking" },
  speaking_full: { label: "Speaking full test", module: "speaking" },
};

/** pick_next: one item, or null when there's no content of that kind. */
export const NextPick = z
  .object({
    kind: StudyItemKind,
    item_id: z.uuid(),
    title: z.string(),
    /** writing: { task_no }; speaking: { part }; speaking_full: { card, p1, p3 }. */
    extra: z.record(z.string(), z.unknown()),
    /** True when every item of the kind was already done (this is the one done longest ago). */
    done_before: z.boolean(),
  })
  .nullable();
export type NextPick = z.infer<typeof NextPick>;

export const AssignedPlan = z.object({ started_on: isoDate, days: z.number().int().min(1).max(60), new: z.boolean() });
export type AssignedPlan = z.infer<typeof AssignedPlan>;

export const PlanItem = z.object({
  day: z.number().int().min(1),
  order: z.number().int().min(1),
  kind: StudyItemKind,
  /** Null while there's no content of that kind yet (it's picked once some is published). */
  item_id: z.uuid().nullable(),
  title: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()).nullable(),
  done: z.boolean(),
  /** From an earlier day, not done yet. */
  carried: z.boolean(),
});
export type PlanItem = z.infer<typeof PlanItem>;

export const MyStudyPlan = z.discriminatedUnion("active", [
  z.object({ active: z.literal(false) }),
  z.object({
    active: z.literal(true),
    started_on: isoDate,
    today: isoDate,
    day: z.number().int().min(1),
    days: z.number().int().min(1),
    items: z.array(PlanItem),
    week: z.array(z.object({ day: z.number().int().min(1), kinds: z.array(StudyItemKind) })),
    progress: z.object({ done: z.number().int().min(0), total: z.number().int().min(0) }),
    finished: z.boolean(),
  }),
]);
export type MyStudyPlan = z.infer<typeof MyStudyPlan>;

/** Whole-percent plan progress. */
export function planPercent(p: { done: number; total: number }): number {
  return p.total > 0 ? Math.round((Math.min(p.done, p.total) / p.total) * 100) : 0;
}

/** Today's items left to do (carried-over ones included). */
export function itemsLeft(items: readonly Pick<PlanItem, "done">[]): number {
  return items.filter((i) => !i.done).length;
}
