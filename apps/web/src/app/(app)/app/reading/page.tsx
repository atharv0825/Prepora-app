import type { Metadata } from "next";
import { AttemptHistory } from "@/components/reading/reading-results";
import { CompletionBar } from "@/components/practice/completion-bar";
import { FilterSelect } from "@/components/practice/filter-select";
import { PracticeHeader } from "@/components/practice/page-header";
import { PracticeCard } from "@/components/practice/practice-card";
import { PickCard } from "@/components/practice/pick-card";
import { formatDate } from "@/lib/credits";
import { planLabel, testTypeLabel } from "@/lib/dashboard";
import { validTimeZone } from "@/lib/onboarding";
import { attemptSummary, listFilter, planAllows } from "@/lib/reading";
import { filterHrefs, readingTestPath, routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount, getMyCredits } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Reading · Prepora", robots: { index: false } };

const FILTERS = [
  { value: "academic", label: "Academic" },
  { value: "general", label: "General Training" },
  { value: "all", label: "All" },
] as const;

// Reading test list (M4-F1): published tests filtered by Academic / General (the student's own
// test type first), this month's Reading allowance, and the student's attempts (M4-F4 history).
// Everything is read through RLS: published tests, the student's own attempts.
export default async function ReadingListPage({ searchParams }: PageProps<"/app/reading">) {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const { profile } = account;
  const filter = listFilter((await searchParams).type, profile?.test_type);
  const timeZone = validTimeZone(profile?.timezone);
  const supabase = await createClient();

  let testsQuery = supabase.from("reading_tests").select("id, title, test_type, min_plan").eq("status", "published").order("created_at");
  if (filter !== "all") testsQuery = testsQuery.eq("test_type", filter);
  const [{ data: tests }, { data: attempts }, credits] = await Promise.all([
    testsQuery,
    supabase
      .from("test_attempts")
      .select("id, test_id, band, raw_score, created_at")
      .eq("module", "reading")
      .order("created_at", { ascending: false })
      .limit(50),
    getMyCredits(),
  ]);

  const plan = credits?.plan ?? profile?.plan ?? "free";
  const summary = attemptSummary(attempts ?? []);
  // Titles for the history, including tests not in the current filter.
  const titleOf = new Map<string, string>((tests ?? []).map((t) => [t.id, t.title]));
  const missing = [...new Set((attempts ?? []).map((a) => a.test_id))].filter((id) => !titleOf.has(id));
  if (missing.length) {
    const { data } = await supabase.from("reading_tests").select("id, title").in("id", missing);
    for (const t of data ?? []) titleOf.set(t.id, t.title);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      {/* Completed ÷ listed (adjusts by itself when tests are published); the monthly limit is on
          each test's start page. */}
      <PracticeHeader
        title="Reading"
        controls={<FilterSelect filters={FILTERS} current={filter} hrefs={filterHrefs(routes.reading)} />}
        progress={
          <CompletionBar
            module="reading"
            completed={(tests ?? []).filter((t) => summary.has(t.id)).length}
            total={tests?.length ?? 0}
            noun={filter === "all" ? ["Reading test", "Reading tests"] : [`${testTypeLabel(filter)} test`, `${testTypeLabel(filter)} tests`]}
            ariaLabel="Reading tests completed"
            testId="reading-progress"
          />
        }
      >
        <p>Full tests with 60 minutes on the clock, marked instantly with a band score.</p>
      </PracticeHeader>


      <section aria-label="Tests">
        {!tests?.length ? (
          <p className="text-muted-foreground">No {filter === "all" ? "" : `${testTypeLabel(filter)} `}tests yet. New tests are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <PickCard kind="reading_test" module="reading" note="A Reading test you haven't taken yet." />
            </li>
            {tests.map((t) => {
              const open = planAllows(plan, t.min_plan);
              const s = summary.get(t.id);
              return (
                <li key={t.id} data-testid="reading-test">
                  <PracticeCard
                    module="reading"
                    href={open ? readingTestPath(t.id) : routes.upgrade}
                    title={t.title}
                    kindLabel={testTypeLabel(t.test_type) ?? "Reading"}
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
        title="Your attempts"
        items={(attempts ?? []).map((a) => ({
          id: a.id,
          date: formatDate(new Date(a.created_at), timeZone),
          title: titleOf.get(a.test_id) ?? "A test no longer available",
          rawScore: a.raw_score,
          band: Number(a.band),
        }))}
      />
    </div>
  );
}
