"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { listeningQuestionTypeLabels } from "@prepora/shared/api/admin-listening";
import { ContentId } from "@prepora/shared/api/admin-reading";
import { ListeningQuestionTypeSchema, parseListeningQuestion, QUESTIONS_PER_SECTION } from "@prepora/shared/ielts/listening";
import { type BuilderState, failure, SESSION_ENDED, signedIn } from "./builder-server";
import { checkImported, type ImportedQuestion } from "./reading-import";

// Listening builder "Import questions" (one section). A Server Function is a public endpoint, so it
// checks the caller is staff itself, on top of the staff RLS policies the write goes through.
// Every question is validated with the SAME contract as the manual form; a map or diagram
// question may come without its picture (the admin adds it in the builder; the test can't be
// published until then). The draft itself is never stored: only the questions are saved, in one
// transaction (admin_import_listening_questions). Answer keys travel admin → server → database
// only; students still only get them after submitting.

const ImportQuestion = z.object({
  /** The number in the draft, for messages. */
  number: z.number().int().min(1).max(99),
  q_type: ListeningQuestionTypeSchema,
  prompt: z.string(),
  options: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
  explanation: z.string().trim().max(4000).nullable(),
});
const ImportRequest = z.object({
  test_id: ContentId,
  order_no: z.number().int().min(1).max(4),
  mode: z.enum(["append", "replace"]),
  questions: z.array(ImportQuestion).min(1).max(QUESTIONS_PER_SECTION),
});
export type ListeningImportRequest = z.input<typeof ImportRequest>;

const PICTURE_FIELDS = ["image_url", "image_alt", "marker", "locations"];

/** A question as it will be saved, re-checked here (the browser's check isn't trusted). */
function validate(q: z.infer<typeof ImportQuestion>): { ok: true; row: Record<string, unknown> } | { ok: false; message: string } {
  const label = `Question ${q.number} (${listeningQuestionTypeLabels[q.q_type]})`;
  const picture = q.q_type === "map_labelling" || q.q_type === "diagram_labelling";
  if (picture && typeof q.options.image_url !== "string") {
    // Without its picture: check everything else the way the preview does, and save no picture fields.
    if (Object.keys(q.options).some((k) => PICTURE_FIELDS.includes(k))) return { ok: false, message: `${label}: invalid picture fields.` };
    const answer = q.answer as { label?: unknown; accept?: unknown } | null;
    const item: ImportedQuestion = {
      number: q.number,
      passage: 1,
      q_type: q.q_type,
      prompt: q.prompt,
      choices: [],
      list: Array.isArray(q.options.word_bank) ? (q.options.word_bank as string[]) : [],
      answer: typeof answer?.label === "string" ? answer.label : Array.isArray(answer?.accept) ? (answer.accept as string[]).join(" / ") : "",
      explanation: q.explanation ?? "",
      paragraphs: [],
      reuse: true,
      select: 1,
      max_words: typeof q.options.max_words === "number" ? q.options.max_words : 2,
      number_allowed: q.options.number_allowed === true,
      bank: Array.isArray(q.options.word_bank),
      needs_image: true,
      instructions: "",
    };
    const checked = checkImported(item, "listening");
    if (checked.error || !checked.content) return { ok: false, message: `${label}: ${checked.error ?? "invalid"}.` };
    return { ok: true, row: { ...checked.content, explanation: q.explanation || null } };
  }
  const parsed = parseListeningQuestion(q);
  if (!parsed.success) return { ok: false, message: `${label}: ${parsed.error.issues[0]?.message ?? "invalid"}.` };
  return { ok: true, row: { ...parsed.data, explanation: q.explanation || null } };
}

/** Saves a previewed import into one section. Nothing is saved unless every question is valid. */
export async function importListeningQuestions(raw: ListeningImportRequest): Promise<BuilderState> {
  const request = ImportRequest.safeParse(raw);
  if (!request.success) return { ok: false, message: "Invalid import. Reload the page and try again." };
  const { test_id, order_no, mode, questions } = request.data;

  const rows = [];
  for (const q of [...questions].sort((a, b) => a.number - b.number)) {
    const checked = validate(q);
    if (!checked.ok) return { ok: false, message: checked.message };
    rows.push(checked.row);
  }

  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data: staff, error: staffError } = await session.supabase.rpc("is_staff");
  if (staffError) return failure("check staff role", staffError);
  if (staff !== true) return { ok: false, message: "Only admins and content editors can import." };

  const { data, error } = await session.supabase.rpc("admin_import_listening_questions", {
    p_test_id: test_id,
    p_order_no: order_no,
    p_mode: mode,
    p_questions: rows as never,
  });
  if (error) return failure("import listening questions", error);
  revalidatePath(`/listening/${test_id}`);
  const r = (data ?? {}) as { questions_imported?: number; section_total?: number };
  const pictures = rows.filter((r) => (r.q_type === "map_labelling" || r.q_type === "diagram_labelling") && !("image_url" in (r.options as object))).length;
  return {
    ok: true,
    message: `Imported ${r.questions_imported ?? 0} question${r.questions_imported === 1 ? "" : "s"} into section ${order_no} (${r.section_total ?? 0} of 10).${
      pictures ? ` Add the picture for ${pictures} map/diagram question${pictures === 1 ? "" : "s"} before publishing.` : ""
    }`,
    savedAt: Date.now(),
  };
}
