import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WritingEditor, type EditorTask } from "@/components/writing/writing-editor";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Writing · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A Writing task's editor (M6-F1/F2). The task is read through RLS (published only); ?photo=1
// (the desktop QR code, M6-F2) opens the photo upload.
export default async function WritingTaskPage({ params, searchParams }: PageProps<"/app/writing/[taskId]">) {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const { taskId } = await params;
  if (!UUID.test(taskId)) notFound();
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("writing_tasks")
    .select("id, task_no, test_type, title, prompt, image_url, image_alt")
    .eq("id", taskId)
    .eq("status", "published")
    .maybeSingle();
  if (!task) notFound();
  const openPhoto = (await searchParams).photo === "1";
  return <WritingEditor task={task as EditorTask} userId={account.user.id} openPhoto={openPhoto} />;
}
