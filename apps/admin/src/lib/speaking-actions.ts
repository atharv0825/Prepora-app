"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContentId, ContentStatus } from "@prepora/shared/api/admin-reading";
import { CueCardForm, cueCardRow, Part1Form, part1Row, Part3Form, part3Row, speakingPublishCheck } from "@prepora/shared/api/admin-speaking";
import { type BuilderState, failure, fieldErrors, SESSION_ENDED, signedIn } from "./builder-server";

// Speaking topic manager: Part 2 cue cards and the Part 3 discussions linked to them (M7-A1), and
// Part 1 question sets on a theme (M8-A1). As the other builders: each Server Function validates its input and writes with the editor's own
// session (speaking_topics staff policies, M7-C1); the database re-checks shapes and publishing order.

const topicPath = (id: string) => `/speaking/${id}`;
const strings = (form: FormData, key: string) => form.getAll(key).filter((v): v is string => typeof v === "string");
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

export async function saveCueCard(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = str(form, "topic_id");
  if (id !== undefined && !ContentId.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const input = CueCardForm.safeParse({ title: str(form, "title"), points: strings(form, "point") });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  if (!id) {
    const { data, error } = await session.supabase
      .from("speaking_topics")
      .insert({ ...cueCardRow(input.data), source: "admin", status: "draft", created_by: session.userId })
      .select("id")
      .single();
    if (error) return failure("create cue card", error);
    revalidatePath("/speaking");
    redirect(topicPath(data.id));
  }
  const { data, error } = await session.supabase.from("speaking_topics").update(cueCardRow(input.data)).eq("id", id).eq("part", 2).select("id");
  if (error) return failure("update cue card", error);
  if (!data?.length) return { ok: false, message: "This cue card no longer exists." };
  revalidatePath(topicPath(id));
  revalidatePath("/speaking");
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

export async function savePart1(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = str(form, "topic_id");
  if (id !== undefined && !ContentId.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const input = Part1Form.safeParse({ title: str(form, "title"), questions: strings(form, "question") });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  if (!id) {
    const { data, error } = await session.supabase
      .from("speaking_topics")
      .insert({ ...part1Row(input.data), source: "admin", status: "draft", created_by: session.userId })
      .select("id")
      .single();
    if (error) return failure("create Part 1 question set", error);
    revalidatePath("/speaking");
    redirect(topicPath(data.id));
  }
  const { data, error } = await session.supabase.from("speaking_topics").update(part1Row(input.data)).eq("id", id).eq("part", 1).select("id");
  if (error) return failure("update Part 1 question set", error);
  if (!data?.length) return { ok: false, message: "This question set no longer exists." };
  revalidatePath(topicPath(id));
  revalidatePath("/speaking");
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

export async function savePart3(_prev: BuilderState, form: FormData): Promise<BuilderState> {
  const id = str(form, "topic_id");
  if (id !== undefined && !ContentId.safeParse(id).success) return { ok: false, message: "Invalid request." };
  const input = Part3Form.safeParse({ title: str(form, "title"), questions: strings(form, "question"), parent_topic_id: str(form, "parent_topic_id") });
  if (!input.success) return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  if (!id) {
    const { data, error } = await session.supabase
      .from("speaking_topics")
      .insert({ ...part3Row(input.data), source: "admin", status: "draft", created_by: session.userId })
      .select("id")
      .single();
    if (error) return failure("create Part 3 discussion", error);
    revalidatePath(topicPath(input.data.parent_topic_id));
    redirect(topicPath(data.id));
  }
  const { data, error } = await session.supabase.from("speaking_topics").update(part3Row(input.data)).eq("id", id).eq("part", 3).select("id");
  if (error) return failure("update Part 3 discussion", error);
  if (!data?.length) return { ok: false, message: "This discussion no longer exists." };
  revalidatePath(topicPath(id));
  revalidatePath(topicPath(input.data.parent_topic_id));
  return { ok: true, message: "Saved.", savedAt: Date.now() };
}

export async function setSpeakingTopicStatus(topicId: string, status: ContentStatus): Promise<BuilderState> {
  if (!ContentId.safeParse(topicId).success || !ContentStatus.safeParse(status).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data: topic, error: loadError } = await session.supabase
    .from("speaking_topics")
    .select("part, title, cue_card_points, questions, parent_topic_id")
    .eq("id", topicId)
    .maybeSingle();
  if (loadError) return failure("load speaking topic", loadError);
  if (!topic) return { ok: false, message: "This topic no longer exists." };
  if (status === "published") {
    let parentStatus: string | null = null;
    if (topic.parent_topic_id) {
      const { data: parent } = await session.supabase.from("speaking_topics").select("status").eq("id", topic.parent_topic_id).maybeSingle();
      parentStatus = parent?.status ?? null;
    }
    const check = speakingPublishCheck({ ...topic, parent_status: parentStatus });
    if (check.blocking.length) return { ok: false, message: check.blocking[0]! };
  }
  const { error } = await session.supabase.from("speaking_topics").update({ status }).eq("id", topicId);
  if (error) return failure("set speaking topic status", error);
  revalidatePath(topicPath(topicId));
  if (topic.parent_topic_id) revalidatePath(topicPath(topic.parent_topic_id));
  revalidatePath("/speaking");
  const words: Record<ContentStatus, string> = { draft: "Moved to draft.", review: "Sent for review.", published: "Published.", archived: "Archived." };
  return { ok: true, message: words[status] };
}

export async function deleteSpeakingTopic(topicId: string): Promise<BuilderState> {
  if (!ContentId.safeParse(topicId).success) return { ok: false, message: "Invalid request." };
  const session = await signedIn();
  if (!session) return SESSION_ENDED;
  const { data: topic } = await session.supabase.from("speaking_topics").select("parent_topic_id").eq("id", topicId).maybeSingle();
  const { data, error } = await session.supabase.from("speaking_topics").delete().eq("id", topicId).select("id");
  // Linked Part 3 discussions or students' answers point at it (on delete restrict).
  if (error?.code === "23503") {
    return { ok: false, message: "It has linked Part 3 discussions or students' answers, so it can't be deleted. Archive it instead." };
  }
  if (error) return failure("delete speaking topic", error);
  if (!data?.length) return { ok: false, message: "Only drafts can be deleted. Move it to draft first." };
  revalidatePath("/speaking");
  redirect(topic?.parent_topic_id ? topicPath(topic.parent_topic_id) : "/speaking");
}
