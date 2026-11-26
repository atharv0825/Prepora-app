import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mic } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { FillerCountSchema, SpeakingFeedback, SpeakingSignals } from "@prepora/shared/api/score-speaking";
import { countFillers, type SpeakingScores } from "@prepora/shared/ielts/speaking";
import { SpeakingFeedbackView } from "@/components/speaking/speaking-feedback";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { routes, speakingTopicPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking feedback · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One scored Speaking answer (M7-F3). Read through RLS: only its owner gets the row; the recording
// is played through a short-lived signed URL while it's kept (30 days).
export default async function SpeakingResponsePage({ params }: PageProps<"/app/speaking/responses/[responseId]">) {
  const account = await getAccount();
  if (!account) return null;
  const { responseId } = await params;
  if (!UUID.test(responseId)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("speaking_responses")
    .select("id, topic_id, transcript, signals, scores, band, feedback, audio_paths, created_at")
    .eq("id", responseId)
    .maybeSingle();
  if (!r) notFound();
  const feedback = SpeakingFeedback.safeParse(r.feedback);
  const signals = SpeakingSignals.safeParse(r.signals);
  if (!feedback.success || !signals.success) notFound();
  const [{ data: topic }, audio] = await Promise.all([
    supabase.from("speaking_topics").select("id, title").eq("id", r.topic_id).maybeSingle(),
    r.audio_paths[0] ? supabase.storage.from("speaking-audio").createSignedUrl(r.audio_paths[0], 3600) : Promise.resolve({ data: null }),
  ]);
  const fillers = countFillers(r.transcript).filter((f) => FillerCountSchema.safeParse(f).success);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 pb-16">
      <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All Speaking
      </Link>
      <h1 className="text-h1">{topic?.title ?? "Speaking feedback"}</h1>
      <SpeakingFeedbackView
        model={{
          title: topic?.title ?? "Speaking",
          transcript: r.transcript,
          signals: signals.data,
          fillers,
          scores: r.scores as SpeakingScores,
          band: Number(r.band),
          feedback: feedback.data,
          date: formatDate(new Date(r.created_at), validTimeZone(account.profile?.timezone)),
          audioUrl: audio.data?.signedUrl ?? null,
        }}
      />
      {topic && (
        <Link href={speakingTopicPath(topic.id)} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          <Mic /> Answer this card again
        </Link>
      )}
    </div>
  );
}
