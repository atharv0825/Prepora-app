"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AdminReadingTest,
  ContentId,
  ContentStatus,
  moveQuestion as moveInOrder,
  publishCheck,
  questionOrder,
  ReadingPassageInput,
  ReadingQuestionInput,
  ReadingTestDetails,
} from "@prepora/shared/api/admin-reading";
import type { Json } from "@prepora/shared/db";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors as questionFieldErrors } from "./reading-builder";

// Reading builder (M4-A1). Server Functions are public endpoints: each one validates its input
// and writes with the editor's own session, so the M4-C1 staff policies decide (admins and
// content editors). Answer keys are read through admin_get_reading_test (staff only).

export type BuilderState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
  savedAt?: number;
  /** A new question's id, so the editor can close. */
  id?: string;
};

const SESSION_ENDED: BuilderState = { ok: false, message: "Your session has ended. Sign in again." };
const Id = ContentId;

function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

/** Database errors in words; details go to the server log only. */
function failure(context: string, error: { code?: string; message: string }): BuilderState {
  console.error(`${context} failed`, error.code, error.message);
  if (error.code === "42501") return { ok: false, message: "Only admins and content editors can do this." };
  if (error.code === "23514") return { ok: false, message: `Not saved: ${error.message}.` };
  if (error.code === "23505") return { ok: false, message: "That number is taken. Reload the page and try again." };
  if (error.code === "P0002") return { ok: false, message: "This test no longer exists." };
  if (error.code === "22023") return { ok: false, message: `Not saved: ${error.message}.` };
  return { ok: false, message: "Couldn't save. Please try again." };
}

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadTest(supabase: Supabase, testId: string) {
  const { data, error } = await supabase.rpc("admin_get_reading_test", { p_test_id: testId });
  if (error) return { ok: false as const, error };
  const parsed = AdminReadingTest.safeParse(data);
  if (!parsed.success) return { ok: false as const, error: { code: "XX000", message: "unexpected admin_get_reading_test shape" } };
  return { ok: true as const, test: parsed.data };
}

/** Renumber every question 1..N in passage order (after an add, a move or a delete). */
async function renumber(supabase: Supabase, testId: string, order?: string[]) {
  const loaded = await loadTest(supabase, testId);
  if (!loaded.ok) return loaded.error;
  const ids = order ?? questionOrder(loaded.test.questions, loaded.test.passages);
  const current = [...loaded.test.questions].sort((a, b) => a.q_no - b.q_no).map((q) => q.id);
  if (ids.every((id, i) => current[i] === id)) return null;
  const { error } = await supabase.rpc("admin_order_reading_questions", { p_test_id: testId, p_ids: ids });
  return error;
}

const builderPath = (testId: string) => `/reading/${testId}`;

// ── Tests ───────────────────────────────────────────────────────────────────────────────────
export async function createReadingTest(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const input = ReadingTestDetails.safeParse({
    title: form.get("title"),
    test_type: form.get("test_type"),
    min_plan: form.get("min_plan"),
  });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };

  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase
    .from("reading_tests")
    .insert({ ...input.data, source: "admin", status: "draft", created_by: session.userId })
    .select("id")
    .single();
  if (error) return failure("create reading test", error);
  revalidatePath("/reading");
  redirect(builderPath(data.id));
}

export async function updateReadingTest(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = Id.safeParse(form.get("test_id"));
  const input = ReadingTestDetails.safeParse({
    title: form.get("title"),
    test_type: form.get("test_type"),
    min_plan: form.get("min_plan"),
  });
  if (!id.success) return { ok: false, message: "Invalid request." };
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };

  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { error } = await session.supabase.from("reading_tests").update(input.data).eq("id", id.data);
  if (error) return failure("update reading test", error);
  revalidatePath(builderPath(id.data));
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

/** Draft ↔ review ↔ published ↔ archived. Publishing runs the checklist first. */
export async function setReadingTestStatus(testId: string, status: ContentStatus): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !ContentStatus.safeParse(status).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;

  if (status === "published") {
    const loaded = await loadTest(session.supabase, testId);
    if (!loaded.ok) return failure("load reading test", loaded.error);
    const check = publishCheck(loaded.test);
    if (check.blocking.length) return { ok: false, message: `Not published: ${check.blocking[0]}` };
  }
  const { data, error } = await session.supabase.from("reading_tests").update({ status }).eq("id", testId).select("id");
  if (error) return failure("set reading test status", error);
  if (!data?.length) return { ok: false, message: "This test no longer exists." };
  revalidatePath(builderPath(testId));
  revalidatePath("/reading");
  const said: Record<ContentStatus, string> = {
    draft: "Moved back to draft. Students can't see it.",
    review: "Sent for review.",
    published: "Published. Students can take it now.",
    archived: "Archived. Students can't see it; their results are kept.",
  };
  return { ok: true, message: said[status], savedAt: Date.now() };
}

/** Drafts only: a published test is archived instead (RLS refuses the delete). */
export async function deleteReadingTest(testId: string): Promise<BuilderState> {
  if (!Id.safeParse(testId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.from("reading_tests").delete().eq("id", testId).select("id");
  if (error) return failure("delete reading test", error);
  if (!data?.length) return { ok: false, message: "Published tests can't be deleted. Archive it instead." };
  revalidatePath("/reading");
  redirect("/reading");
}

// ── Passages ────────────────────────────────────────────────────────────────────────────────
export async function saveReadingPassage(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const input = ReadingPassageInput.safeParse({
    test_id: form.get("test_id"),
    order_no: form.get("order_no"),
    title: form.get("title"),
    body: form.get("body") ?? "",
  });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };

  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { test_id, order_no, title, body } = input.data;
  const { data: existing, error: findError } = await session.supabase
    .from("reading_passages")
    .select("id")
    .eq("test_id", test_id)
    .eq("order_no", order_no)
    .maybeSingle();
  if (findError) return failure("find passage", findError);
  const { error } = existing
    ? await session.supabase.from("reading_passages").update({ title, body }).eq("id", existing.id)
    : await session.supabase.from("reading_passages").insert({ test_id, order_no, title, body });
  if (error) return failure("save passage", error);
  revalidatePath(builderPath(test_id));
  return { ok: true, message: `Passage ${order_no} saved.`, savedAt: Date.now() };
}

// ── Questions ───────────────────────────────────────────────────────────────────────────────
export async function saveReadingQuestion(raw: unknown): Promise<BuilderState> {
  const input = ReadingQuestionInput.safeParse(raw);
  if (!input.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: questionFieldErrors(input.error.issues) };
  }
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { supabase } = session;
  const q = input.data;
  const row = {
    passage_id: q.passage_id,
    q_type: q.q_type,
    prompt: q.prompt,
    options: q.options as Json,
    answer: q.answer as Json,
    explanation: q.explanation,
  };

  let id = q.id;
  if (id) {
    const { data, error } = await supabase.from("reading_questions").update(row).eq("id", id).eq("test_id", q.test_id).select("id");
    if (error) return failure("update question", error);
    if (!data?.length) return { ok: false, message: "This question no longer exists. Reload the page." };
  } else {
    // A new question goes last for now (numbers have no gaps, so count + 1 is free), then the
    // renumbering below moves it to the end of its passage.
    const { count, error: countError } = await supabase
      .from("reading_questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", q.test_id);
    if (countError) return failure("count questions", countError);
    if ((count ?? 0) >= 40) return { ok: false, message: "A test has 40 questions at most." };
    const { data, error } = await supabase
      .from("reading_questions")
      .insert({ ...row, test_id: q.test_id, q_no: (count ?? 0) + 1 })
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

export async function deleteReadingQuestion(testId: string, questionId: string): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !Id.safeParse(questionId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { error } = await session.supabase.from("reading_questions").delete().eq("id", questionId).eq("test_id", testId);
  if (error) return failure("delete question", error);
  const orderError = await renumber(session.supabase, testId);
  if (orderError) return failure("renumber questions", orderError);
  revalidatePath(builderPath(testId));
  return { ok: true, message: "Question deleted.", savedAt: Date.now() };
}

export async function moveReadingQuestion(testId: string, questionId: string, direction: "up" | "down"): Promise<BuilderState> {
  if (!Id.safeParse(testId).success || !Id.safeParse(questionId).success || !["up", "down"].includes(direction)) {
    return { ok: false, message: "Invalid request." };
  }
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const loaded = await loadTest(session.supabase, testId);
  if (!loaded.ok) return failure("load reading test", loaded.error);
  const order = moveInOrder(loaded.test.questions, loaded.test.passages, questionId, direction);
  if (!order) return { ok: true, message: "" };
  const orderError = await renumber(session.supabase, testId, order);
  if (orderError) return failure("move question", orderError);
  revalidatePath(builderPath(testId));
  return { ok: true, message: "Moved.", savedAt: Date.now() };
}
