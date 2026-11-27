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
import { routes, speakingExaminerPath, speakingSessionPath, speakingTopicPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking feedback · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One scored Speaking part (M7-F3; Parts 1 and 3 since M8-F3). Read through RLS: only its owner
// gets the row. A Part 2 recording is played through a short-lived signed URL while it's kept (30
// days); Parts 1 and 3 have one recording per answer, so their transcript is the record.
export default async function SpeakingResponsePage({ params }: PageProps<"/app/speaking/responses/[responseId]">) {
  const account = await getAccount();
  if (!account) return null;
  const { responseId } = await params;
  if (!UUID.test(responseId)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("speaking_responses")
    .select("id, session_id, part, topic_id, transcript, signals, scores, band, feedback, audio_paths, created_at")
    .eq("id", responseId)
    .maybeSingle();
  if (!r) notFound();
  const feedback = SpeakingFeedback.safeParse(r.feedback);
  const signals = SpeakingSignals.safeParse(r.signals);
  if (!feedback.success || !signals.success) notFound();
  const part = r.part as 1 | 2 | 3;
  const [{ data: topic }, { data: session }, audio] = await Promise.all([
    supabase.from("speaking_topics").select("id, title, status").eq("id", r.topic_id).maybeSingle(),
    supabase.from("speaking_sessions").select("id, mode").eq("id", r.session_id).maybeSingle(),
    part === 2 && r.audio_paths[0] ? supabase.storage.from("speaking-audio").createSignedUrl(r.audio_paths[0], 3600) : Promise.resolve({ data: null }),
  ]);
  const inTest = session?.mode === "full_test";
  const fillers = countFillers(r.transcript).filter((f) => FillerCountSchema.safeParse(f).success);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 pb-16">
      <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All Speaking
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground" data-testid="response-part">
          Part {part}
          {inTest ? " · full test" : ""}
        </p>
        <h1 className="text-h1">{topic?.title ?? "Speaking feedback"}</h1>
      </div>
      <SpeakingFeedbackView
        model={{
          title: topic?.title ?? "Speaking",
          part,
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
      <div className="flex flex-wrap gap-3">
        {inTest && session && (
          <Link href={speakingSessionPath(session.id)} className={cn(buttonVariants(), "self-start")}>
            Back to the test results
          </Link>
        )}
        {topic?.status === "published" && (
          <Link href={part === 2 ? speakingTopicPath(topic.id) : speakingExaminerPath(topic.id)} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
            <Mic /> {part === 2 ? "Answer this card again" : `Practise this Part ${part} again`}
          </Link>
        )}
      </div>
    </div>
  );
}
