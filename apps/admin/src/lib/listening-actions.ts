"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminListeningTest,
  listeningPublishCheck,
  listeningQuestionOrder,
  ListeningQuestionInput,
  ListeningSectionAudio,
  ListeningSectionInput,
  ListeningTestCreate,
  ListeningTestDetails,
  moveListeningQuestion as moveInOrder,
  nextQuestionNumber,
} from "@prepora/shared/api/admin-listening";
import { ContentId, ContentStatus } from "@prepora/shared/api/admin-reading";
import type { Json } from "@prepora/shared/db";
import { type BuilderState, failure, fieldErrors, SESSION_ENDED, signedIn, type Supabase } from "./builder-server";
import { fieldErrors as questionFieldErrors } from "./reading-builder";

// Listening builder (M5-A1). As the Reading builder: each Server Function validates its input and
// writes with the editor's own session (M5-C1 staff policies). Keys and transcripts are read
// through admin_get_listening_test (staff only). The recording itself goes browser → R2 with a
// presigned URL from r2-upload-url (M5-B1); only its public URL and length are saved here.

const Id = ContentId;
const builderPath = (testId: string) => `/listening/${testId}`;

async function loadTest(supabase: Supabase, testId: string) {
  const { data, error } = await supabase.rpc("admin_get_listening_test", { p_test_id: testId });
  if (error) return { ok: false as const, error };
  const parsed = AdminListeningTest.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: { code: "XX000", message: "unexpected admin_get_listening_test shape" } };
  return { ok: true as const, test: parsed.data };
}

/** Renumber questions within their sections (after an add, a move or a delete). */
async function renumber(supabase: Supabase, testId: string, order?: string[]) {
  const loaded = await loadTest(supabase, testId);
  if (!loaded.ok) return loaded.error;
  const ids = order ?? listeningQuestionOrder(loaded.test.questions, loaded.test.sections);
  const { error } = await supabase.rpc("admin_order_listening_questions", { p_test_id: testId, p_ids: ids });
  return error;
}

// ── Tests ───────────────────────────────────────────────────────────────────────────────────
// No title: the database gives the test the next number and names it ("Listening Test 3";
// migration 20261203100000).
export async function createListeningTest(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const input = ListeningTestCreate.safeParse({ min_plan: form.get("min_plan") });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase
    .from("listening_tests")
    .insert({ ...input.data, source: "admin", status: "draft", created_by: session.userId })
    .select("id")
    .single();
  if (error) return failure("create listening test", error);
  revalidatePath("/listening");
  redirect(builderPath(data.id));
}

export async function updateListeningTest(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = Id.safeParse(form.get("test_id"));
  const input = ListeningTestDetails.safeParse({ title: form.get("title"), min_plan: form.get("min_plan") });
  if (!id.success) return { ok: false, message: "Invalid request." };
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { error } = await session.supabase.from("listening_tests").update(input.data).eq("id", id.data);
  if (error) return failure("update listening test", error);
  revalidatePath(builderPath(id.data));
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

export async function setListeningTestStatus(testId: string, status: ContentStatus): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !ContentStatus.safeParse(status).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  if (status === "published") {
    const loaded = await loadTest(session.supabase, testId);
    if (!loaded.ok) return failure("load listening test", loaded.error);
    const check = listeningPublishCheck(loaded.test);
    if (check.blocking.length) return { ok: false, message: `Not published: ${check.blocking[0]}` };
  }
  const { data, error } = await session.supabase.from("listening_tests").update({ status }).eq("id", testId).select("id");
  if (error) return failure("set listening test status", error);
  if (!data?.length) return { ok: false, message: "This test no longer exists." };
  revalidatePath(builderPath(testId));
  revalidatePath("/listening");
  const said: Record<ContentStatus, string> = {
    draft: "Moved back to draft. Students can't see it.",
    review: "Sent for review.",
    published: "Published. Students can take it now.",
    archived: "Archived. Students can't see it; their results are kept.",
  };
  return { ok: true, message: said[status], savedAt: Date.now() };
}

export async function deleteListeningTest(testId: string): Promise<BuilderState> {
  if (!Id.safeParse(testId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.from("listening_tests").delete().eq("id", testId).select("id");
  if (error) return failure("delete listening test", error);
  if (!data?.length) return { ok: false, message: "Published tests can't be deleted. Archive it instead." };
  revalidatePath("/listening");
  redirect("/listening");
}

// ── Sections ────────────────────────────────────────────────────────────────────────────────
type SectionValues = { title?: string; transcript?: string | null; audio_url?: string; duration_sec?: number | null; tts_voices?: Record<string, string> };

/** The voices picker's hidden JSON field; anything unreadable counts as "no choices". */
function voicesField(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function upsertSection(supabase: Supabase, testId: string, orderNo: number, values: SectionValues) {
  const { data: existing, error: findError } = await supabase
    .from("listening_sections")
    .select("id")
    .eq("test_id", testId)
    .eq("order_no", orderNo)
    .maybeSingle();
  if (findError) return findError;
  const { error } = existing
    ? await supabase.from("listening_sections").update(values).eq("id", existing.id)
    : await supabase.from("listening_sections").insert({ test_id: testId, order_no: orderNo, title: `Part ${orderNo}`, ...values });
  return error;
}

/** Title, transcript and the voice per speaker (for generated audio). */
export async function saveListeningSection(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const input = ListeningSectionInput.safeParse({
    test_id: form.get("test_id"),
    order_no: form.get("order_no"),
    title: form.get("title"),
    transcript: form.get("transcript") ?? "",
    tts_voices: voicesField(form.get("tts_voices")),
  });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { test_id, order_no, title, transcript, tts_voices } = input.data;
  const error = await upsertSection(session.supabase, test_id, order_no, { title, transcript: transcript || null, tts_voices });
  if (error) return failure("save section", error);
  revalidatePath(builderPath(test_id));
  return { ok: true, message: `Section ${order_no} saved.`, savedAt: Date.now() };
}

/** The recording, once it's in R2: its public URL and length. */
export async function saveListeningSectionAudio(raw: unknown): Promise<BuilderState> {
  const input = ListeningSectionAudio.safeParse(raw);
  if (!input.success) return { ok: false, message: "That recording's address isn't valid." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { test_id, order_no, audio_url, duration_sec } = input.data;
  const error = await upsertSection(session.supabase, test_id, order_no, { audio_url, duration_sec });
  if (error) return failure("save section audio", error);
  revalidatePath(builderPath(test_id));
  return { ok: true, message: `Recording for section ${order_no} saved.`, savedAt: Date.now() };
}

// ── Questions ───────────────────────────────────────────────────────────────────────────────
export async function saveListeningQuestion(raw: unknown): Promise<BuilderState> {
  const input = ListeningQuestionInput.safeParse(raw);
  if (!input.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: questionFieldErrors(input.error.issues) };
  }
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { supabase } = session;
  const q = input.data;
  const row = {
    section_id: q.section_id,
    q_type: q.q_type,
    prompt: q.prompt,
    options: q.options as Json,
    answer: q.answer as Json,
    explanation: q.explanation,
  };

  const loaded = await loadTest(supabase, q.test_id);
  if (!loaded.ok) return failure("load listening test", loaded.error);
  const section = loaded.test.sections.find((s) => s.id === q.section_id);
  if (!section) return { ok: false, message: "This section no longer exists. Reload the page." };

  let id = q.id;
  if (id) {
    const before = loaded.test.questions.find((x) => x.id === id);
    if (!before) return { ok: false, message: "This question no longer exists. Reload the page." };
    // Moving to another section takes the next free number there.
    const moving = before.section_id !== q.section_id;
    const q_no = moving ? nextQuestionNumber(loaded.test.questions, section) : before.q_no;
    if (q_no === null) return { ok: false, message: `Section ${section.order_no} already has 10 questions.` };
    const { error } = await supabase.from("listening_questions").update({ ...row, q_no }).eq("id", id).eq("test_id", q.test_id);
    if (error) return failure("update question", error);
  } else {
    const q_no = nextQuestionNumber(loaded.test.questions, section);
    if (q_no === null) return { ok: false, message: `Section ${section.order_no} already has 10 questions.` };
    const { data, error } = await supabase
      .from("listening_questions")
      .insert({ ...row, test_id: q.test_id, q_no })
      .select("id")
      .single();
    if (error) return failure("add question", error);
    id = data.id;
  }

  const orderError = await renumber(supabase, q.test_id);
  if (orderError) return failure("renumber questions", orderError);
  revalidatePath(builderPath(q.test_id));
  return { ok: true, message: q.id ? "Question saved." : "Question added.", savedAt: Date.now(), id };
}

export async function deleteListeningQuestion(testId: string, questionId: string): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !Id.safeParse(questionId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { error } = await session.supabase.from("listening_questions").delete().eq("id", questionId).eq("test_id", testId);
  if (error) return failure("delete question", error);
  const orderError = await renumber(session.supabase, testId);
  if (orderError) return failure("renumber questions", orderError);
  revalidatePath(builderPath(testId));
  return { ok: true, message: "Question deleted.", savedAt: Date.now() };
}

export async function moveListeningQuestion(testId: string, questionId: string, direction: "up" | "down"): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !Id.safeParse(questionId).success || !["up", "down"].includes(direction)) {
    return { ok: false, message: "Invalid request." };
  }
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const loaded = await loadTest(session.supabase, testId);
  if (!loaded.ok) return failure("load listening test", loaded.error);
  const order = moveInOrder(loaded.test.questions, loaded.test.sections, questionId, direction);
  if (!order) return { ok: true, message: "" };
  const orderError = await renumber(session.supabase, testId, order);
  if (orderError) return failure("move question", orderError);
  revalidatePath(builderPath(testId));
  return { ok: true, message: "Moved.", savedAt: Date.now() };
}
