import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { buttonVariants } from "@prepora/ui/components/button";
import { ListeningAttemptPayload } from "@prepora/shared/api/listening-test";
import { ListeningResults } from "@/components/listening/listening-results";
import { AttemptHistory } from "@/components/reading/reading-results";
import { formatDateTime } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { durationText } from "@/lib/reading";
import { listeningTestPath, routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Listening results · Prepora", robots: { index: false } };

// One past Listening attempt, reopened from the history: the same results view the student saw
// after submitting (band, score per part, every question, transcripts), from
// get_listening_attempt (owner only: anyone else gets a 404), plus their attempts at this test.
export default async function ListeningAttemptPage({ params }: PageProps<"/app/listening/attempts/[attemptId]">) {
  const { attemptId } = await params;
  if (!z.uuid().safeParse(attemptId).success) notFound();
  const account = await getAccount();
  if (!account) return null;
  const timeZone = validTimeZone(account.profile?.timezone);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_listening_attempt", { p_attempt_id: attemptId });
  const parsed = ListeningAttemptPayload.safeParse(data);
  if (error || !parsed.success) notFound();
  const { attempt, test, transcripts } = parsed.data;

  const { data: history } = await supabase
    .from("test_attempts")
    .select("id, raw_score, band, created_at, mode")
    .eq("module", "listening")
    .eq("test_id", attempt.test_id)
    .order("created_at", { ascending: false })
    .limit(20);
  const title = test?.title ?? "Listening test";
  const duration = durationText(attempt.time_taken_sec);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-1">
        <Link href={routes.listening} className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Listening tests
        </Link>
        <h1 className="text-h1">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateTime(new Date(attempt.created_at), timeZone)}
          {duration ? ` · ${duration}` : ""}
        </p>
      </div>

      {attempt.results ? (
        <ListeningResults
          data={{ mode: attempt.mode ?? "practice", raw_score: attempt.raw_score, total: attempt.results.length, band: attempt.band, results: attempt.results, transcripts }}
        />
      ) : (
        <p className="text-muted-foreground">The question-by-question results weren&apos;t saved for this attempt.</p>
      )}

      <div className="flex flex-wrap gap-3">
        {test && (
          <Link href={listeningTestPath(test.id)} className={buttonVariants()}>
            Take this test again
          </Link>
        )}
        <Link href={routes.listening} className={buttonVariants({ variant: "outline" })}>
          Choose another test
        </Link>
      </div>

      <AttemptHistory
        module="listening"
        title="Your attempts at this test"
        currentId={attempt.id}
        items={(history ?? []).map((a) => ({
          id: a.id,
          date: formatDateTime(new Date(a.created_at), timeZone),
          title,
          rawScore: a.raw_score,
          band: Number(a.band),
          note: a.mode === "exam" ? "exam mode" : a.mode === "practice" ? "practice mode" : null,
        }))}
      />
    </div>
  );
}
