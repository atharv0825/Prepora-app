"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ContentId, MAX_QUESTIONS, ReadingPassageInput, ReadingQuestionInput } from "@prepora/shared/api/admin-reading";
import { readingQuestionTypeLabels } from "@prepora/shared/ielts/reading";
import { type BuilderState, failure, SESSION_ENDED, signedIn, type Supabase } from "./builder-server";

// Reading builder import (Paste content / Upload document). Server Functions are public
// endpoints, so each one checks the caller is staff (admin or content_editor) itself, on top of
// the staff RLS policies the writes go through.
//
//   extractDraftText(file)  → the document's plain text (.txt, .md, .docx, .pdf). The file is
//                             read in memory and dropped: nothing is stored.
//   importReadingContent()  → validates every passage and question with the SAME contracts as the
//                             manual form, then saves them in one transaction
//                             (admin_import_reading_content). Answer keys only travel admin →
//                             server → database; students still only get them after submitting.

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TEXT_TYPES = [".txt", ".md", ".markdown"];

async function staffSession(): Promise<{ supabase: Supabase } | BuilderState> {
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.rpc("is_staff");
  if (error) return failure("check staff role", error);
  if (data !== true) return { ok: false, message: "Only admins and content editors can import." };
  return { supabase: session.supabase };
}

export type ExtractResult = { ok: true; text: string; name: string } | { ok: false; message: string };

/** An uploaded draft → plain text for the parser. */
export async function extractDraftText(form: FormData): Promise<ExtractResult> {
  const staff = await staffSession();
  if (!("supabase" in staff)) return { ok: false, message: staff.message };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a file to upload." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "The file is larger than 10 MB." };
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));

  try {
    let text: string;
    if (TEXT_TYPES.includes(ext)) {
      text = await file.text();
    } else if (ext === ".docx") {
      const mammoth = await import("mammoth");
      // Node build of mammoth: { buffer } (its { arrayBuffer } input is browser-only).
      const result = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
      text = result.value;
    } else if (ext === ".pdf") {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      const result = await extractText(pdf, { mergePages: false });
      text = (Array.isArray(result.text) ? result.text : [result.text]).join("\n\n");
    } else {
      return { ok: false, message: "Upload a .txt, .md, .docx or .pdf file." };
    }
    text = text.replace(/\r\n?/g, "\n").replace(/ /g, " ");
    if (!text.trim()) return { ok: false, message: "No text found in the file. A scanned PDF has no text: paste the content instead." };
    return { ok: true, text, name: file.name };
  } catch (e) {
    console.error("extract draft text failed", ext, e instanceof Error ? e.message : e);
    return { ok: false, message: "Couldn't read that file. Try saving it again, or paste the content instead." };
  }
}

const ImportPassage = z.object({ order_no: z.number().int().min(1).max(3), title: z.string(), body: z.string() });
const ImportQuestion = z.object({
  passage_order_no: z.number().int().min(1).max(3),
  /** The number in the draft, for messages and order. */
  number: z.number().int().min(1).max(99),
  q_type: z.string(),
  prompt: z.string(),
  options: z.record(z.string(), z.unknown()),
  answer: z.unknown(),
  explanation: z.string().nullable(),
});
const ImportRequest = z.object({
  test_id: ContentId,
  mode: z.enum(["append", "replace"]),
  passages: z.array(ImportPassage).max(3),
  questions: z.array(ImportQuestion).max(MAX_QUESTIONS),
});
export type ImportRequest = z.input<typeof ImportRequest>;

/** Saves a previewed import. Nothing is saved unless every passage and question is valid. */
export async function importReadingContent(raw: ImportRequest): Promise<BuilderState> {
  const request = ImportRequest.safeParse(raw);
  if (!request.success) return { ok: false, message: "Invalid import. Reload the page and try again." };
  const { test_id, mode, passages, questions } = request.data;
  if (!passages.length && !questions.length) return { ok: false, message: "Nothing to import." };
  if (new Set(passages.map((p) => p.order_no)).size !== passages.length) {
    return { ok: false, message: "Two passages go to the same place. Choose a different passage number for one of them." };
  }

  // The manual form's validation, item by item, with the item named in the message.
  const cleanPassages = [];
  for (const p of passages) {
    const parsed = ReadingPassageInput.safeParse({ test_id, ...p });
    if (!parsed.success) return { ok: false, message: `Passage ${p.order_no}: ${parsed.error.issues[0]?.message ?? "invalid"}.` };
    cleanPassages.push({ order_no: parsed.data.order_no, title: parsed.data.title, body: parsed.data.body });
  }
  const cleanQuestions = [];
  for (const q of [...questions].sort((a, b) => a.passage_order_no - b.passage_order_no || a.number - b.number)) {
    // passage_id isn't known yet for a new passage; the test id stands in (same shape, not saved).
    const parsed = ReadingQuestionInput.safeParse({ test_id, passage_id: test_id, ...q });
    if (!parsed.success) {
      const label = readingQuestionTypeLabels[q.q_type as keyof typeof readingQuestionTypeLabels] ?? q.q_type;
      return { ok: false, message: `Question ${q.number} (${label}): ${parsed.error.issues[0]?.message ?? "invalid"}.` };
    }
    const { q_type, prompt, options, answer, explanation } = parsed.data;
    cleanQuestions.push({ passage_order_no: q.passage_order_no, q_type, prompt, options, answer, explanation });
  }

  const staff = await staffSession();
  if (!("supabase" in staff)) return staff;
  const { data, error } = await staff.supabase.rpc("admin_import_reading_content", {
    p_test_id: test_id,
    p_mode: mode,
    p_passages: cleanPassages,
    p_questions: cleanQuestions as never,
  });
  if (error) return failure("import reading content", error);
  revalidatePath(`/reading/${test_id}`);
  const r = (data ?? {}) as { passages_created?: number; passages_replaced?: number; questions_imported?: number; questions_total?: number };
  const parts = [
    r.passages_created ? `${r.passages_created} passage${r.passages_created === 1 ? "" : "s"} added` : null,
    r.passages_replaced ? `${r.passages_replaced} replaced` : null,
    `${r.questions_imported ?? 0} question${r.questions_imported === 1 ? "" : "s"} imported`,
  ].filter(Boolean);
  return { ok: true, message: `Imported: ${parts.join(", ")}. The test now has ${r.questions_total ?? 0} questions.`, savedAt: Date.now() };
}
