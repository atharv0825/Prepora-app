import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { AttemptHistory } from "@/components/reading/reading-results";
import { ReadingProgress } from "@/components/reading/reading-progress";
import { TestCard } from "@/components/reading/test-card";
import { formatDate } from "@/lib/credits";
import { planLabel, testTypeLabel } from "@/lib/dashboard";
import { validTimeZone } from "@/lib/onboarding";
import { attemptSummary, listFilter, planAllows } from "@/lib/reading";
import { readingTestPath, routes } from "@/lib/routes";
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
      {/* Title on the left, the completion bar on the right (completed ÷ listed: it adjusts by
          itself when new tests are published; the monthly limit is on each test's start page). */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">Reading</h1>
          <p className="text-muted-foreground">Full tests with 60 minutes on the clock, marked instantly with a band score.</p>
        </div>
        <ReadingProgress
          completed={(tests ?? []).filter((t) => summary.has(t.id)).length}
          total={tests?.length ?? 0}
          scope={filter === "all" ? "Reading" : (testTypeLabel(filter) ?? "Reading")}
          className="shrink-0"
        />
      </div>


      <nav aria-label="Test type" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`${routes.reading}?type=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              // 3D pills in brand-rust (the palette's brown): the chosen one filled, the others white.
              "rounded-full px-4 py-2 text-sm font-medium transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-rust",
              filter === f.value
                ? "bg-gradient-to-b from-[#a65453] to-brand-rust text-white ring-1 ring-black/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-2px_0_rgb(0_0_0/0.12),0_8px_16px_-8px_rgb(140_63_63/0.8)]"
                : "bg-gradient-to-b from-white to-[#f7efee] text-brand-rust ring-1 ring-brand-rust/25 shadow-[inset_0_1px_0_white,inset_0_-2px_0_rgb(140_63_63/0.08),0_6px_12px_-8px_rgb(140_63_63/0.55)] dark:from-[#164c58] dark:to-[#0f3b47] dark:text-[#f2c4c4] dark:ring-white/10",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <section aria-label="Tests">
        {!tests?.length ? (
          <p className="text-muted-foreground">No {filter === "all" ? "" : `${testTypeLabel(filter)} `}tests yet. New tests are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tests.map((t) => {
              const open = planAllows(plan, t.min_plan);
              const s = summary.get(t.id);
              return (
                <li key={t.id} data-testid="reading-test">
                  <TestCard
                    href={open ? readingTestPath(t.id) : routes.upgrade}
                    title={t.title}
                    typeLabel={testTypeLabel(t.test_type) ?? "Reading"}
                    status={s ? `Taken ${s.count} ${s.count === 1 ? "time" : "times"} · best band ${s.best.toFixed(1)}` : "Not taken yet"}
                    taken={!!s}
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
