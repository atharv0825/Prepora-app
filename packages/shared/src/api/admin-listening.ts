// Admin Listening builder contract (M5-A1). Same shape as the Reading builder (admin-reading.ts).
//
//   admin_get_listening_test(id) → AdminListeningTest: keys, explanations and transcripts (staff only)
//   admin_order_listening_questions(id, ids[]) → numbers questions within their sections
//   r2-upload-url (M5-B1) → presigned PUT for a section's recording
//   storage bucket listening-images (M5-B3) → map and diagram images
//   listening_tests / listening_sections / listening_questions: plain writes (staff RLS, M5-C1)
//
// A section holds questions 10n−9 … 10n (section 2: 11–20), up to 10.
import { z } from "zod";
import { PlanTier } from "./credits";
import { ContentStatus } from "./admin-reading";
import { ListeningQuestionTypeSchema, LISTENING_SECTIONS, parseListeningQuestion, QUESTIONS_PER_SECTION } from "../ielts/listening";
import { readingQuestionTypeLabels } from "../ielts/reading";
import type { ListeningQuestionType } from "../ielts/listening";

export const listeningQuestionTypeLabels: Record<ListeningQuestionType, string> = {
  ...readingQuestionTypeLabels,
  map_labelling: "Map / plan labelling",
  diagram_labelling: "Diagram labelling",
};

export const TRANSCRIPT_MAX = 30_000;

// ── What the builder loads ──────────────────────────────────────────────────────────────────
export const AdminListeningQuestion = z.object({
  id: z.uuid(),
  section_id: z.uuid(),
  q_no: z.number().int().min(1).max(40),
  q_type: ListeningQuestionTypeSchema,
  prompt: z.string(),
  options: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
  explanation: z.string().nullable(),
});
export type AdminListeningQuestion = z.infer<typeof AdminListeningQuestion>;

export const AdminListeningSection = z.object({
  id: z.uuid(),
  order_no: z.number().int().min(1).max(LISTENING_SECTIONS),
  title: z.string(),
  audio_url: z.string().nullable(),
  duration_sec: z.number().int().nullable(),
  transcript: z.string().nullable(),
  updated_at: z.string(),
  /** Where the recording came from, and for generated audio what it was made of. */
  audio_source: z.enum(["uploaded", "generated"]).nullable().default(null),
  audio_hash: z.string().nullable().default(null),
  audio_chars: z.number().int().nullable().default(null),
  audio_generated_at: z.string().nullable().default(null),
  /** The admin's voice per speaker for generated audio. */
  tts_voices: z.record(z.string(), z.string()).default({}),
});
export type AdminListeningSection = z.infer<typeof AdminListeningSection>;

export const AdminListeningTest = z.object({
  test: z.object({
    id: z.uuid(),
    title: z.string(),
    source: z.enum(["admin", "ai"]),
    status: ContentStatus,
    min_plan: PlanTier,
    published_at: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  sections: z.array(AdminListeningSection).max(LISTENING_SECTIONS),
  questions: z.array(AdminListeningQuestion).max(40),
  /** Characters this test has sent to text-to-speech (all generations). */
  tts_chars_used: z.number().int().default(0),
});
export type AdminListeningTest = z.infer<typeof AdminListeningTest>;

// ── What the builder saves ──────────────────────────────────────────────────────────────────
const title = z.string().trim().min(1, "Enter a title").max(200, "200 characters at most");

export const ListeningTestDetails = z.object({ title, min_plan: PlanTier });
export type ListeningTestDetails = z.infer<typeof ListeningTestDetails>;

/** Creating a test: no title. The database numbers it and names it ("Listening Test 3"). */
export const ListeningTestCreate = ListeningTestDetails.omit({ title: true });
export type ListeningTestCreate = z.infer<typeof ListeningTestCreate>;

/** A section's title and transcript (what is said, shown to students after they submit). */
export const ListeningSectionInput = z.object({
  test_id: z.uuid(),
  order_no: z.coerce.number().int().min(1).max(LISTENING_SECTIONS),
  title,
  transcript: z
    .string()
    .transform((s) => s.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(TRANSCRIPT_MAX, `${TRANSCRIPT_MAX.toLocaleString("en")} characters at most`)),
  /** Voice per speaker for generated audio: Google Standard voices only. */
  tts_voices: z
    .record(z.string().max(40), z.string().regex(/^[a-z]{2,3}-[A-Z]{2}-Standard-[A-Z]$/, "Standard voices only"))
    .refine((v) => Object.keys(v).length <= 12, "12 speakers at most")
    .default({}),
});
export type ListeningSectionInput = z.infer<typeof ListeningSectionInput>;

/** After the upload to R2: the recording's public URL and length. */
export const ListeningSectionAudio = z.object({
  test_id: z.uuid(),
  order_no: z.number().int().min(1).max(LISTENING_SECTIONS),
  audio_url: z.url({ protocol: /^https?$/ }).max(2000),
  duration_sec: z.number().int().min(1).max(3600).nullable(),
});
export type ListeningSectionAudio = z.infer<typeof ListeningSectionAudio>;

/** One question as the builder sends it; content is validated per type (13 types). */
export const ListeningQuestionInput = z
  .object({
    test_id: z.uuid(),
    section_id: z.uuid(),
    id: z.uuid().optional(),
    q_type: ListeningQuestionTypeSchema,
    prompt: z.string(),
    options: z.record(z.string(), z.unknown()),
    answer: z.unknown(),
    explanation: z
      .string()
      .trim()
      .max(4000, "4,000 characters at most")
      .transform((s) => (s === "" ? null : s))
      .nullable(),
  })
  .transform((input, ctx) => {
    const content = parseListeningQuestion(input);
    if (!content.success) {
      for (const issue of content.error.issues) ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      return z.NEVER;
    }
    return { ...input, ...content.data };
  });
export type ListeningQuestionInput = z.output<typeof ListeningQuestionInput>;

// ── Numbering ───────────────────────────────────────────────────────────────────────────────
type Numbered = { id: string; section_id: string; q_no: number };
type Ordered = { id: string; order_no: number };

/** Question ids in test order: by section, then by current number. */
export function listeningQuestionOrder(questions: readonly Numbered[], sections: readonly Ordered[]): string[] {
  const rank = new Map(sections.map((s) => [s.id, s.order_no]));
  return [...questions]
    .sort((a, b) => (rank.get(a.section_id) ?? 9) - (rank.get(b.section_id) ?? 9) || a.q_no - b.q_no)
    .map((q) => q.id);
}

/** The order with one question moved within its section; null if it can't move. */
export function moveListeningQuestion(questions: readonly Numbered[], sections: readonly Ordered[], id: string, direction: "up" | "down"): string[] | null {
  const order = listeningQuestionOrder(questions, sections);
  const sectionOf = new Map(questions.map((q) => [q.id, q.section_id]));
  const i = order.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= order.length || sectionOf.get(order[j]!) !== sectionOf.get(id)) return null;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return order;
}

/** The number a new question in this section gets (null when the section is full). */
export function nextQuestionNumber(questions: readonly Pick<Numbered, "section_id">[], section: Ordered): number | null {
  const count = questions.filter((q) => q.section_id === section.id).length;
  return count >= QUESTIONS_PER_SECTION ? null : (section.order_no - 1) * QUESTIONS_PER_SECTION + count + 1;
}

/** A map or diagram question without its picture yet (e.g. imported from a draft). */
export const needsImage = (q: Pick<AdminListeningQuestion, "q_type" | "options">) =>
  (q.q_type === "map_labelling" || q.q_type === "diagram_labelling") && typeof q.options.image_url !== "string";

// ── Publishing ──────────────────────────────────────────────────────────────────────────────
export type ListeningPublishCheck = { blocking: string[]; warnings: string[] };

/**
 * What stops a Listening test from being published. The database checks 4 sections with audio and
 * transcripts and numbering 1..N again; the per-type content and section filling it can't.
 */
export function listeningPublishCheck(t: {
  sections: readonly Pick<AdminListeningSection, "id" | "order_no" | "audio_url" | "transcript">[];
  questions: readonly AdminListeningQuestion[];
}): ListeningPublishCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const sections = [...t.sections].sort((a, b) => a.order_no - b.order_no);
  const questions = [...t.questions].sort((a, b) => a.q_no - b.q_no);

  if (sections.length !== LISTENING_SECTIONS) blocking.push(`Add all 4 sections (${sections.length} so far).`);
  for (const s of sections) {
    if (!s.audio_url) blocking.push(`Upload the recording for section ${s.order_no}.`);
    if (!s.transcript?.trim()) blocking.push(`Write the transcript for section ${s.order_no}.`);
  }
  if (questions.length === 0) blocking.push("Add questions.");
  else if (questions.some((q, i) => q.q_no !== i + 1)) {
    // Numbers run on from section to section, so only the last section with questions may be short.
    const short = sections.find((s, i) => {
      const own = questions.filter((q) => q.section_id === s.id).length;
      const later = sections.slice(i + 1).some((l) => questions.some((q) => q.section_id === l.id));
      return own < QUESTIONS_PER_SECTION && later;
    });
    blocking.push(
      short
        ? `Section ${short.order_no} needs 10 questions before later sections can have any (numbers run 1–10, 11–20, …).`
        : "Question numbers have a gap. Reorder the questions to fix it.",
    );
  }
  for (const q of questions) {
    if (needsImage(q)) {
      blocking.push(`Question ${q.q_no} (${listeningQuestionTypeLabels[q.q_type]}): add its picture.`);
      continue;
    }
    const parsed = parseListeningQuestion(q);
    if (!parsed.success) {
      blocking.push(`Question ${q.q_no} (${listeningQuestionTypeLabels[q.q_type]}): ${parsed.error.issues[0]?.message ?? "invalid"}.`);
    }
  }

  for (const s of sections) {
    const own = questions.filter((q) => q.section_id === s.id).length;
    if (own > 0 && own < QUESTIONS_PER_SECTION) warnings.push(`Section ${s.order_no} has ${own} of 10 questions.`);
    if (own === 0) warnings.push(`Section ${s.order_no} has no questions.`);
  }
  const unexplained = questions.filter((q) => !q.explanation?.trim()).map((q) => q.q_no);
  if (unexplained.length) {
    warnings.push(`No explanation for question${unexplained.length > 1 ? "s" : ""} ${unexplained.join(", ")}. Students see one with their results.`);
  }
  return { blocking, warnings };
}
