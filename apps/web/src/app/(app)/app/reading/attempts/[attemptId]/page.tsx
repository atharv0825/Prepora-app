import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { QuestionResult } from "@prepora/shared/api/grade-test";
import { ReadingTestPayload } from "@prepora/shared/api/reading-test";
import { AttemptHistory, ResultList, ScoreCard } from "@/components/reading/reading-results";
import { formatDateTime } from "@/lib/credits";
import { testTypeLabel } from "@/lib/dashboard";
import { validTimeZone } from "@/lib/onboarding";
import { durationText, resultsByPassage } from "@/lib/reading";
import { readingTestPath, routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Reading results · Prepora", robots: { index: false } };

// One Reading attempt's results (M4-F4): band, score, every question with the student's answer,
// the correct answer and the explanation (saved with the attempt by grade-test), grouped by
// passage, and the student's attempts at this test. RLS: only the owner can read the attempt;
// anyone else gets a 404.
export default async function ReadingAttemptPage({ params }: PageProps<"/app/reading/attempts/[attemptId]">) {
  const { attemptId } = await params;
  if (!z.uuid().safeParse(attemptId).success) notFound();
  const account = await getAccount();
  if (!account) return null;
  const timeZone = validTimeZone(account.profile?.timezone);
  const supabase = await createClient();

  const { data: attempt } = await supabase
    .from("test_attempts")
    .select("id, test_id, module, raw_score, band, time_taken_sec, created_at, results")
    .eq("id", attemptId)
    .eq("module", "reading")
    .maybeSingle();
  if (!attempt) notFound();

  const [{ data: testData }, { data: history }] = await Promise.all([
    // For the title, the passages and the prompts. Null if the test was withdrawn or is now
    // above the student's plan: the results are still shown, without the prompts.
    supabase.rpc("get_reading_test", { p_test_id: attempt.test_id }),
    supabase
      .from("test_attempts")
      .select("id, raw_score, band, created_at")
      .eq("module", "reading")
      .eq("test_id", attempt.test_id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const test = ReadingTestPayload.safeParse(testData).data ?? null;
  const results = z.array(QuestionResult).safeParse(attempt.results).data ?? null;
  const title = test?.test.title ?? "Reading test";
  const prompts = new Map((test?.questions ?? []).map((q) => [q.q_no, q.prompt]));
  const total = results?.length ?? test?.questions.length ?? null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 pb-16" data-testid="reading-results">
      <div className="flex flex-col gap-1">
        <Link href={routes.reading} className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Reading tests
        </Link>
        <h1 className="text-h1">{title}</h1>
      </div>

      <ScoreCard
        band={Number(attempt.band)}
        rawScore={attempt.raw_score}
        total={total}
        testType={test ? testTypeLabel(test.test.test_type) : null}
        duration={durationText(attempt.time_taken_sec)}
        date={formatDateTime(new Date(attempt.created_at), timeZone)}
      />

      <div className="flex flex-wrap gap-3">
        {test && (
          <Link href={readingTestPath(test.test.id)} className={buttonVariants()}>
            Take this test again
          </Link>
        )}
        <Link href={routes.reading} className={cn(buttonVariants({ variant: "outline" }))}>
          Choose another test
        </Link>
      </div>

      {results ? (
        resultsByPassage(results, test?.questions ?? [], test?.passages ?? []).map((g) => (
          <ResultList
            key={g.passage?.id ?? "rest"}
            title={g.passage ? `Passage ${g.passage.order_no}: ${g.passage.title}` : test ? "Other questions" : "Questions"}
            results={g.results}
            prompts={prompts}
          />
        ))
      ) : (
        <p className="text-muted-foreground">The question-by-question results weren&apos;t saved for this earlier attempt.</p>
      )}

      <AttemptHistory
        title="Your attempts at this test"
        currentId={attempt.id}
        items={(history ?? []).map((a) => ({
          id: a.id,
          date: formatDateTime(new Date(a.created_at), timeZone),
          title,
          rawScore: a.raw_score,
          band: Number(a.band),
        }))}
      />
    </div>
  );
}
