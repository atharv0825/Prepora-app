import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ExaminerPractice } from "@/components/speaking/examiner-practice";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// M8-F1: practise Part 1 (a question set) or Part 3 (a discussion) with the AI examiner. Only
// published Part 1/3 topics (RLS + filter). A Part 3 says which cue card it follows on from.
export default async function SpeakingExaminerPage({ params }: PageProps<"/app/speaking/examiner/[topicId]">) {
  const account = await getAccount();
  if (!account) return null;
  const { topicId } = await params;
  if (!UUID.test(topicId)) notFound();
  const supabase = await createClient();
  const { data: topic } = await supabase.from("speaking_topics").select("id, part, title, parent_topic_id").eq("id", topicId).in("part", [1, 3]).eq("status", "published").maybeSingle();
  if (!topic) notFound();
  const part = topic.part as 1 | 3;
  const { data: card } = topic.parent_topic_id
    ? await supabase.from("speaking_topics").select("title").eq("id", topic.parent_topic_id).maybeSingle()
    : { data: null };
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6 pb-16">
      <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All Speaking
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">Speaking Part {part}</h1>
        <p className="text-muted-foreground">
          {topic.title}
          {card ? <> · a discussion following the cue card &ldquo;{card.title}&rdquo;</> : null}
        </p>
      </div>
      <ExaminerPractice part={part} topic={{ id: topic.id, title: topic.title }} userId={account.user.id} />
    </div>
  );
}
