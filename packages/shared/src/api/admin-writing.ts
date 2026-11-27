// Writing task manager contract (M6-A1). The admin form (apps/admin) and its Server Functions
// validate with these; the database checks the same rules again (M6-C1, M6-A1 migrations).
//
// A task is one of three kinds, which map onto writing_tasks' columns:
//   t1_academic → task_no 1, test_type academic, a chart/graph/table/diagram image (required to publish)
//   t1_general  → task_no 1, test_type general (a letter, no image)
//   t2          → task_no 2, test_type null (both tests) or one test
import { z } from "zod";
import type { PublishCheck } from "./admin-reading";

export const writingTaskKinds = ["t1_academic", "t1_general", "t2"] as const;
export type WritingTaskKind = (typeof writingTaskKinds)[number];

export const writingTaskKindLabels: Record<WritingTaskKind, string> = {
  t1_academic: "Task 1 Academic (report on a visual)",
  t1_general: "Task 1 General Training (letter)",
  t2: "Task 2 (essay)",
};

/** The kind of a stored task. */
export function writingTaskKind(task: { task_no: number; test_type: "academic" | "general" | null }): WritingTaskKind {
  if (task.task_no === 2) return "t2";
  return task.test_type === "general" ? "t1_general" : "t1_academic";
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s || null)
    .nullable()
    .optional()
    .transform((s) => s ?? null);

/** The form as submitted (FormData values are strings). */
export const WritingTaskForm = z
  .object({
    kind: z.enum(writingTaskKinds),
    /** Task 2 only: "both" (stored as null), or one test. */
    t2_test_type: z.enum(["both", "academic", "general"]).optional().default("both"),
    title: z.string().trim().min(1, "Give the task a title").max(200, "200 characters at most"),
    prompt: z.string().trim().min(20, "Write the task as students will see it (20 characters or more)").max(4000, "4,000 characters at most"),
    image_url: optionalText(2000).refine((u) => u === null || /^https?:\/\/\S+$/.test(u), "Use an http(s) link, or upload the image"),
    image_alt: optionalText(300),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.kind !== "t1_academic" && f.image_url) {
      ctx.addIssue({ code: "custom", path: ["image_url"], message: "Only Task 1 Academic has an image" });
    }
  });
export type WritingTaskForm = z.input<typeof WritingTaskForm>;

/** The writing_tasks columns for a valid form. */
export function writingTaskRow(f: z.output<typeof WritingTaskForm>) {
  const academic = f.kind === "t1_academic";
  return {
    task_no: f.kind === "t2" ? 2 : 1,
    test_type: f.kind === "t1_academic" ? "academic" : f.kind === "t1_general" ? "general" : f.t2_test_type === "both" ? null : f.t2_test_type,
    title: f.title,
    prompt: f.prompt,
    image_url: academic ? f.image_url : null,
    image_alt: academic ? f.image_alt : null,
  } as const;
}

export type AdminWritingTask = {
  task_no: number;
  test_type: "academic" | "general" | null;
  prompt: string;
  image_url: string | null;
  image_alt: string | null;
};

/** What must be fixed before publishing, and what's worth a look. The server checks it again. */
export function writingPublishCheck(t: AdminWritingTask): PublishCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const kind = writingTaskKind(t);
  if (kind === "t1_academic" && !t.image_url) blocking.push("Upload the chart, graph, table or diagram the report describes.");
  if (kind === "t1_academic" && t.image_url && !t.image_alt) warnings.push("Add a description of the image for screen readers.");
  if (kind === "t1_general" && !/•|^\s*[-*]\s|\n\s*[-*•]/m.test(t.prompt)) {
    warnings.push("Letter tasks usually list three bullet points for the letter to cover.");
  }
  if (t.prompt.trim().length < 60) warnings.push("The task text is very short. Students see exactly this.");
  return { blocking, warnings };
}
