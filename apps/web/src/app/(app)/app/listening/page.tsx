import type { Metadata } from "next";
import { Headphones } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { PracticeCard } from "@/components/practice/practice-card";
import { PickCard } from "@/components/practice/pick-card";
import { AttemptHistory } from "@/components/reading/reading-results";
import { formatDate } from "@/lib/credits";
import { planLabel } from "@/lib/dashboard";
import { validTimeZone } from "@/lib/onboarding";
import { attemptSummary, planAllows } from "@/lib/reading";
import { listeningTestPath, routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount, getMyCredits } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Listening · Prepora", robots: { index: false } };

const modeNote = (mode: string | null) => (mode === "exam" ? "exam mode" : mode === "practice" ? "practice mode" : null);

// Listening home: published tests (one test serves Academic and General Training, so there's no
// filter), this month's Listening allowance, and the student's attempts, each reopening its
// results. Same pieces as the Reading list (M4-F1/F4). Read through RLS: published tests, the
// student's own attempts.
export default async function ListeningListPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const { profile } = account;
  const timeZone = validTimeZone(profile?.timezone);
  const supabase = await createClient();

  const [{ data: tests }, { data: attempts }, credits] = await Promise.all([
    supabase.from("listening_tests").select("id, title, min_plan").eq("status", "published").order("created_at"),
    supabase
      .from("test_attempts")
      .select("id, test_id, band, raw_score, created_at, mode")
      .eq("module", "listening")
      .order("created_at", { ascending: false })
      .limit(50),
    getMyCredits(),
  ]);

  const plan = credits?.plan ?? profile?.plan ?? "free";
  const summary = attemptSummary(attempts ?? []);
  // Titles for the history, including tests no longer published.
  const titleOf = new Map<string, string>((tests ?? []).map((t) => [t.id, t.title]));
  const missing = [...new Set((attempts ?? []).map((a) => a.test_id))].filter((id) => !titleOf.has(id));
  if (missing.length) {
    const { data } = await supabase.from("listening_tests").select("id, title").in("id", missing);
    for (const t of data ?? []) titleOf.set(t.id, t.title);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      {/* Completed ÷ published (adjusts by itself); the monthly limit is on each test's start screen. */}
      <PracticeHeader
        title="Listening"
        progress={
          <CompletionBar
            completed={(tests ?? []).filter((t) => summary.has(t.id)).length}
            total={tests?.length ?? 0}
            noun={["Listening test", "Listening tests"]}
            ariaLabel="Listening tests completed"
            testId="listening-progress"
          />
        }
      >
        <p>Four recorded parts and 40 questions. Exam mode plays each part once, as on test day; practice mode lets you replay.</p>
      </PracticeHeader>

      <section aria-label="Tests">
        {!tests?.length ? (
          <p className="text-muted-foreground">No Listening tests yet. New tests are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <PickCard kind="listening_test" module="listening" note="A Listening test you haven't taken yet." />
            </li>
            {tests.map((t) => {
              const open = planAllows(plan, t.min_plan);
              const s = summary.get(t.id);
              return (
                <li key={t.id} data-testid="listening-test">
                  <PracticeCard
                    module="listening"
                    href={open ? listeningTestPath(t.id) : routes.upgrade}
                    title={t.title}
                    kindLabel="Listening · 4 parts"
                    icon={Headphones}
                    status={s ? `Taken ${s.count} ${s.count === 1 ? "time" : "times"} · best band ${s.best.toFixed(1)}` : "Not taken yet"}
                    done={!!s}
                    lockedPlan={open ? null : planLabel(t.min_plan)}
                    planTag={t.min_plan !== "free" ? planLabel(t.min_plan) : null}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AttemptHistory
        module="listening"
        title="Your attempts"
        items={(attempts ?? []).map((a) => ({
          id: a.id,
          date: formatDate(new Date(a.created_at), timeZone),
          title: titleOf.get(a.test_id) ?? "A test no longer available",
          rawScore: a.raw_score,
          band: Number(a.band),
          note: modeNote(a.mode),
        }))}
      />
    </div>
  );
}
