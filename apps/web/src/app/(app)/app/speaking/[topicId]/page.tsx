import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SpeakingFlow } from "@/components/speaking/speaking-flow";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A Part 2 cue card's recorder (M7-F1/F2/F3). Only published Part 2 cards (RLS + filter).
export default async function SpeakingTopicPage({ params }: PageProps<"/app/speaking/[topicId]">) {
  const account = await getAccount();
  if (!account) return null;
  const { topicId } = await params;
  if (!UUID.test(topicId)) notFound();
  const supabase = await createClient();
  const { data: topic } = await supabase.from("speaking_topics").select("id, title, cue_card_points").eq("id", topicId).eq("part", 2).eq("status", "published").maybeSingle();
  if (!topic) notFound();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All cue cards
      </Link>
      <h1 className="text-h1">Speaking Part 2</h1>
      <SpeakingFlow topic={{ id: topic.id, title: topic.title, points: topic.cue_card_points ?? [] }} userId={account.user.id} />
    </div>
  );
}
