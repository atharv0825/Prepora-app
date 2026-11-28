import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { SpeakingFeedback } from "@prepora/shared/api/score-speaking";
import { speakingCriteria, speakingCriterionLabel, type SpeakingScores } from "@prepora/shared/ielts/speaking";
import { partsOf, type SessionMode, sessionOverallBand } from "@prepora/shared/ielts/speaking-session";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { routes, speakingExaminerPath, speakingResponsePath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking results · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PART_NAMES = { 1: "Introduction and interview", 2: "Cue card", 3: "Discussion" } as const;

// M8-F3: a Speaking session's results: the overall band, each part's band, criteria and summary,
// with a link to its full feedback. There's no Speaking full test any more; earlier full tests still
// show their results here, with "Go deeper" (another Part 3 discussion on the same card's theme).
// Read through RLS (own sessions and responses only).
export default async function SpeakingSessionPage({ params }: PageProps<"/app/speaking/sessions/[sessionId]">) {
  const account = await getAccount();
  if (!account) return null;
  const { sessionId } = await params;
  if (!UUID.test(sessionId)) notFound();
  const supabase = await createClient();
  const { data: session } = await supabase.from("speaking_sessions").select("id, mode, status, overall_band, started_at, completed_at").eq("id", sessionId).maybeSingle();
  if (!session) notFound();
  const { data: responses } = await supabase.from("speaking_responses").select("id, part, topic_id, band, scores, feedback").eq("session_id", session.id);
  const topicIds = (responses ?? []).map((r) => r.topic_id);
  const { data: topics } = topicIds.length ? await supabase.from("speaking_topics").select("id, title").in("id", topicIds) : { data: [] };
  const titleOf = new Map((topics ?? []).map((t) => [t.id, t.title]));
  const mode = session.mode as SessionMode;
  const byPart = new Map((responses ?? []).map((r) => [r.part as 1 | 2 | 3, r]));
  const parts = partsOf(mode);
  const finished = parts.every((p) => byPart.has(p));
  // The stored band, or (if the session update didn't land) the same rule over the parts' bands.
  const overall =
    session.overall_band !== null ? Number(session.overall_band) : sessionOverallBand(mode, Object.fromEntries([...byPart].map(([p, r]) => [p, Number(r.band)])));
  const fullTest = mode === "full_test";

  // After a full test: another discussion on the card's theme (one not done here, if any), or a new card.
  const card = byPart.get(2)?.topic_id;
  let deeper: string | null = null;
  if (fullTest && finished && card) {
    const { data: discussions } = await supabase.from("speaking_topics").select("id").eq("status", "published").eq("part", 3).eq("parent_topic_id", card);
    const ids = (discussions ?? []).map((d) => d.id);
    deeper = ids.find((d) => d !== byPart.get(3)?.topic_id) ?? ids[0] ?? null;
  }

  const timeZone = validTimeZone(account.profile?.timezone);
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 pb-16">
      <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All Speaking
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1">{fullTest ? "Full test results" : `Part ${parts[0]} results`}</h1>
        <p className="text-sm text-muted-foreground">{formatDate(new Date(session.completed_at ?? session.started_at), timeZone)}</p>
      </div>

      <section className="flex flex-col gap-2 rounded-3xl bg-secondary p-6 sm:p-8" aria-label="Overall band">
        {finished && overall !== null ? (
          <>
            <p className="text-sm text-muted-foreground">{fullTest ? "Estimated overall Speaking band" : "Estimated band"}</p>
            <p className="text-display font-semibold" data-testid="overall-band">
              {overall.toFixed(1)}
            </p>
            {fullTest && <p className="text-sm text-muted-foreground">The average of your three parts, rounded as IELTS does (to the nearest half band).</p>}
          </>
        ) : (
          <>
            <p className="text-h3">This test isn&apos;t finished</p>
            <p className="text-sm text-muted-foreground">
              {byPart.size} of {parts.length} parts done. Your overall band comes when every part is scored.
            </p>
          </>
        )}
      </section>

      <ul className="flex flex-col gap-4" aria-label="Bands per part">
        {parts.map((p) => {
          const r = byPart.get(p);
          const feedback = r ? SpeakingFeedback.safeParse(r.feedback) : null;
          const scores = r?.scores as SpeakingScores | undefined;
          return (
            <li key={p} className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6 shadow-sm" data-testid={`part-${p}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Part {p} · {PART_NAMES[p]}
                  </p>
                  <h2 className="text-h3">{r ? (titleOf.get(r.topic_id) ?? "A topic no longer available") : "Not answered yet"}</h2>
                </div>
                {r && (
                  <p className="shrink-0 text-3xl font-semibold tabular-nums" data-testid={`part-${p}-band`}>
                    {Number(r.band).toFixed(1)}
                  </p>
                )}
              </div>
              {r && scores && (
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {speakingCriteria.map((c) => (
                    <div key={c} className="flex flex-col rounded-2xl bg-secondary/60 px-3 py-2">
                      <dt className="text-muted-foreground">{speakingCriterionLabel(c)}</dt>
                      <dd className="font-semibold tabular-nums">{Number(scores[c]).toFixed(1)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {feedback?.success && <p className="text-sm leading-relaxed">{feedback.data.summary}</p>}
              {r && (
                <Link href={speakingResponsePath(r.id)} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
                  Full feedback and transcript <ArrowRight />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      {fullTest && finished && deeper && (
        <section className="flex flex-col gap-3" aria-label="What next">
          <h2 className="text-h3">What next?</h2>
          <div className="flex flex-wrap gap-3">
            <Link href={speakingExaminerPath(deeper)} className={buttonVariants()} data-testid="go-deeper">
              <Layers /> Go deeper: more Part 3 on this theme
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
