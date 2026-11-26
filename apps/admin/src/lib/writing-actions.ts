"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentId, ContentStatus } from "@prepora/shared/api/admin-reading";
import { WritingTaskForm, writingPublishCheck, writingTaskRow } from "@prepora/shared/api/admin-writing";
import { type BuilderState, failure, fieldErrors, SESSION_ENDED, signedIn } from "./builder-server";

// Writing task manager (M6-A1). As the Reading and Listening builders: each Server Function
// validates its input and writes with the editor's own session (writing_tasks staff policies,
// M6-C1). Task 1 Academic images go browser → the public writing-images bucket (M6-A1); only
// their URL is saved here.

const taskPath = (taskId: string) => `/writing/${taskId}`;

function formInput(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return WritingTaskForm.safeParse({
    kind: get("kind"),
    t2_test_type: get("t2_test_type"),
    title: get("title"),
    prompt: get("prompt"),
    image_url: get("image_url"),
    image_alt: get("image_alt"),
  });
}

export async function createWritingTask(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const input = formInput(form);
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase
    .from("writing_tasks")
    .insert({ ...writingTaskRow(input.data), source: "admin", status: "draft", created_by: session.userId })
    .select("id")
    .single();
  if (error) return failure("create writing task", error);
  revalidatePath("/writing");
  redirect(taskPath(data.id));
}

export async function updateWritingTask(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = ContentId.safeParse(form.get("task_id"));
  const input = formInput(form);
  if (!id.success) return { ok: false, message: "Invalid request." };
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.from("writing_tasks").update(writingTaskRow(input.data)).eq("id", id.data).select("id");
  if (error) return failure("update writing task", error);
  if (!data?.length) return { ok: false, message: "This task no longer exists." };
  revalidatePath(taskPath(id.data));
  revalidatePath("/writing");
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

export async function setWritingTaskStatus(taskId: string, status: ContentStatus): Promise<BuilderState> {
  if (!ContentId.safeParse(taskId).success || !ContentStatus.safeParse(status).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  if (status === "published") {
    const { data: task, error } = await session.supabase
      .from("writing_tasks")
      .select("task_no, test_type, prompt, image_url, image_alt")
      .eq("id", taskId)
      .maybeSingle();
    if (error) return failure("load writing task", error);
    if (!task) return { ok: false, message: "This task no longer exists." };
    const check = writingPublishCheck(task);
    if (check.blocking.length) return { ok: false, message: check.blocking[0]! };
  }
  const { error } = await session.supabase.from("writing_tasks").update({ status }).eq("id", taskId);
  if (error) return failure("set writing task status", error);
  revalidatePath(taskPath(taskId));
  revalidatePath("/writing");
  const words: Record<ContentStatus, string> = { draft: "Moved to draft.", review: "Sent for review.", published: "Published.", archived: "Archived." };
  return { ok: true, message: words[status] };
}

export async function deleteWritingTask(taskId: string): Promise<BuilderState> {
  if (!ContentId.safeParse(taskId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data, error } = await session.supabase.from("writing_tasks").delete().eq("id", taskId).select("id");
  // Students' answers point at the task (on delete restrict): it can only be archived.
  if (error?.code === "23503") return { ok: false, message: "Students have answered this task, so it can't be deleted. Archive it instead." };
  if (error) return failure("delete writing task", error);
  if (!data?.length) return { ok: false, message: "Only drafts can be deleted. Move it to draft first." };
  revalidatePath("/writing");
  redirect("/writing");
}
