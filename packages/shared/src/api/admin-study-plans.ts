// M8.7-A1: what the admin's study plan editor sends (admin_save_study_template, …_admin_study_templates.sql)
// and the coverage check shown while editing: a template should give every kind of practice, in
// every module, at least once. Activating one needs full coverage (the database checks too).
import { z } from "zod";
import { type StudyItemKind, studyItemKinds } from "./study-plan";

/** The kinds a template can use and must cover: every kind but the retired Speaking full test. */
export const TEMPLATE_KINDS = ["reading_test", "listening_test", "writing_t1", "writing_t2", "speaking_p1", "speaking_p2"] as const satisfies readonly StudyItemKind[];
export const TemplateKind = z.enum(TEMPLATE_KINDS);
export type TemplateKind = z.infer<typeof TemplateKind>;

export const MODULES = ["reading", "listening", "writing", "speaking"] as const;
export type StudyModule = (typeof MODULES)[number];

export const MAX_DAYS = 60;
export const MAX_ITEMS_PER_DAY = 10;

export const TemplateItem = z.object({
  day: z.number().int().min(1).max(MAX_DAYS),
  order: z.number().int().min(1).max(MAX_ITEMS_PER_DAY),
  kind: TemplateKind,
});
export type TemplateItem = z.infer<typeof TemplateItem>;

export const TemplateForm = z
  .object({
    name: z.string().trim().min(1, "Give the plan a name.").max(100, "Keep the name under 100 characters."),
    days: z.coerce.number().int("Whole days only.").min(1, "A plan lasts at least 1 day.").max(MAX_DAYS, `A plan lasts at most ${MAX_DAYS} days.`),
    test_type: z.enum(["academic", "general"]).nullable(),
    items: z.array(TemplateItem).max(MAX_DAYS * MAX_ITEMS_PER_DAY),
  })
  .superRefine((t, ctx) => {
    if (t.items.some((i) => i.day > t.days)) ctx.addIssue({ code: "custom", path: ["items"], message: `Some items are after day ${t.days}. Remove them or make the plan longer.` });
    const seen = new Set<string>();
    for (const i of t.items) {
      const key = `${i.day}:${i.order}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: ["items"], message: `Day ${i.day} has two items in place ${i.order}.` });
      seen.add(key);
    }
  });
export type TemplateForm = z.infer<typeof TemplateForm>;

export type Coverage = {
  /** Items of each kind. */
  counts: Record<TemplateKind, number>;
  missingKinds: TemplateKind[];
  missingModules: StudyModule[];
  /** Every kind (so every module) at least once. */
  complete: boolean;
  /** Days with nothing to do. */
  emptyDays: number[];
};

/** What a template covers: how many of each kind, what's missing, and empty days. */
export function templateCoverage(items: readonly { day: number; kind: StudyItemKind }[], days: number): Coverage {
  const counts = Object.fromEntries(TEMPLATE_KINDS.map((k) => [k, 0])) as Record<TemplateKind, number>;
  for (const i of items) if (i.kind in counts) counts[i.kind as TemplateKind] += 1;
  const missingKinds = TEMPLATE_KINDS.filter((k) => counts[k] === 0);
  const missingModules = MODULES.filter((m) => !TEMPLATE_KINDS.some((k) => studyItemKinds[k].module === m && counts[k] > 0));
  const used = new Set(items.map((i) => i.day));
  const emptyDays = Array.from({ length: days }, (_, d) => d + 1).filter((d) => !used.has(d));
  return { counts, missingKinds, missingModules, complete: missingKinds.length === 0, emptyDays };
}

/** Rows (day, order_no, kind) → the editor's days: kinds per day, in order. */
export function itemsByDay(rows: readonly { day: number; order_no: number; kind: StudyItemKind }[], days: number): TemplateKind[][] {
  const out: TemplateKind[][] = Array.from({ length: days }, () => []);
  for (const r of [...rows].sort((a, b) => a.day - b.day || a.order_no - b.order_no)) {
    if (r.day >= 1 && r.day <= days && (TEMPLATE_KINDS as readonly string[]).includes(r.kind)) out[r.day - 1]!.push(r.kind as TemplateKind);
  }
  return out;
}

/** The editor's days → items with day and order (1-based, gaps closed). */
export function dayItems(days: readonly (readonly TemplateKind[])[]): TemplateItem[] {
  return days.flatMap((kinds, d) => kinds.map((kind, o) => ({ day: d + 1, order: o + 1, kind })));
}
