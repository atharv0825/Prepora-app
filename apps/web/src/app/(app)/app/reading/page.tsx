import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { allowanceRemaining } from "@prepora/shared/api/credits";
import { AllowanceMeter } from "@/components/allowance-meter";
import { AttemptHistory } from "@/components/reading/reading-results";
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
  const allowance = credits?.allowances.find((a) => a.type === "reading_tests") ?? null;
  const remaining = allowance ? allowanceRemaining(allowance) : null;
  const summary = attemptSummary(attempts ?? []);
  // Titles for the history, including tests not in the current filter.
  const titleOf = new Map<string, string>((tests ?? []).map((t) => [t.id, t.title]));
  const missing = [...new Set((attempts ?? []).map((a) => a.test_id))].filter((id) => !titleOf.has(id));
  if (missing.length) {
    const { data } = await supabase.from("reading_tests").select("id, title").in("id", missing);
    for (const t of data ?? []) titleOf.set(t.id, t.title);
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Reading</h1>
        <p className="text-muted-foreground">Full tests with 60 minutes on the clock, marked instantly with a band score.</p>
      </div>

      {allowance && <AllowanceMeter module="Reading" used={allowance.used} limit={allowance.limit} />}

      <nav aria-label="Test type" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`${routes.reading}?type=${f.value}`}
            aria-current={filter === f.value ? "page" : undefined}
            className={cn(
              "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-black/15 hover:border-primary",
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
          <ul className="grid gap-4 sm:grid-cols-2">
            {tests.map((t) => {
              const open = planAllows(plan, t.min_plan);
              const s = summary.get(t.id);
              return (
                <li key={t.id} className="flex flex-col gap-4 rounded-3xl border border-black/5 bg-white p-5 shadow-sm" data-testid="reading-test">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{testTypeLabel(t.test_type)}</Badge>
                    {t.min_plan !== "free" && (
                      <Badge variant="outline">
                        {!open && <Lock aria-hidden />}
                        {planLabel(t.min_plan)}
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-h3">{t.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {s ? `Taken ${s.count} ${s.count === 1 ? "time" : "times"} · best band ${s.best.toFixed(1)}` : "Not taken yet"}
                  </p>
                  {open ? (
                    <Link
                      href={readingTestPath(t.id)}
                      className={cn(buttonVariants({ variant: remaining === 0 ? "outline" : "default" }), "mt-auto self-start")}
                    >
                      {s ? "Take again" : "Start test"} <ArrowRight />
                    </Link>
                  ) : (
                    <Link href={routes.upgrade} className={cn(buttonVariants({ variant: "outline" }), "mt-auto self-start")}>
                      Unlock with {planLabel(t.min_plan)}
                    </Link>
                  )}
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
