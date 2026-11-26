// Speaking topic manager contract (M7-A1): Part 2 cue cards and the Part 3 discussions linked to
// them (parent_topic_id). Part 1 question sets come with M8-A1. The admin form and its Server
// Functions validate with these; the database checks the same rules (M7-C1).
import { z } from "zod";
import type { PublishCheck } from "./admin-reading";

const line = (max: number, what: string) => z.string().trim().min(1, `Write the ${what}`).max(max, `${max} characters at most`);
/** Form lists arrive with blank rows (an empty "add another" field): drop them before counting. */
const items = (what: string, min: number, max: number, each: number) =>
  z
    .array(z.string())
    .transform((xs) => xs.map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(line(each, what)).min(min, `Add at least ${min} ${what}${min > 1 ? "s" : ""}`).max(max, `${max} ${what}s at most`));

export const CueCardForm = z
  .object({
    /** "Describe a place you like to visit" — the task on the card. */
    title: line(200, "task"),
    /** The "You should say:" points, in order. */
    points: items("point", 2, 5, 200),
  })
  .strict();
export type CueCardForm = z.input<typeof CueCardForm>;

export const Part3Form = z
  .object({
    /** The discussion's theme ("Tourism and the environment"). */
    title: line(200, "theme"),
    /** The examiner's questions, in order. */
    questions: items("question", 1, 12, 300),
    parent_topic_id: z.uuid(),
  })
  .strict();
export type Part3Form = z.input<typeof Part3Form>;

export function cueCardRow(f: z.output<typeof CueCardForm>) {
  return { part: 2, title: f.title, cue_card_points: f.points, questions: null, parent_topic_id: null } as const;
}

export function part3Row(f: z.output<typeof Part3Form>) {
  return { part: 3, title: f.title, questions: f.questions, cue_card_points: null, parent_topic_id: f.parent_topic_id } as const;
}

export type AdminSpeakingTopic = {
  part: number;
  title: string;
  cue_card_points: string[] | null;
  questions: string[] | null;
  /** Part 3: the linked card's status. */
  parent_status?: string | null;
};

/** What must be fixed before publishing, and what's worth a look. The database checks it again. */
export function speakingPublishCheck(t: AdminSpeakingTopic): PublishCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (t.part === 2) {
    const n = t.cue_card_points?.length ?? 0;
    if (n < 2 || n > 5) blocking.push("A cue card needs 2 to 5 points.");
    if (!/^describe\b/i.test(t.title.trim())) warnings.push('Part 2 tasks usually start with "Describe…".');
    if (n > 0 && !/^and\b/i.test(t.cue_card_points!.at(-1)!.trim())) warnings.push('The last point is usually "and explain why…".');
  } else if (t.part === 3) {
    if (!(t.questions?.length ?? 0)) blocking.push("Add the examiner's questions.");
    if (t.parent_status !== "published") blocking.push("Publish its Part 2 cue card first.");
    if ((t.questions?.length ?? 0) < 4) warnings.push("Part 3 usually has 4 to 6 questions.");
  }
  return { blocking, warnings };
}
