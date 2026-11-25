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
  const allowance = credits?.allowances.find((a) => a.type === "listening_tests") ?? null;
  const remaining = allowance ? allowanceRemaining(allowance) : null;
  const summary = attemptSummary(attempts ?? []);
  // Titles for the history, including tests no longer published.
  const titleOf = new Map<string, string>((tests ?? []).map((t) => [t.id, t.title]));
  const missing = [...new Set((attempts ?? []).map((a) => a.test_id))].filter((id) => !titleOf.has(id));
  if (missing.length) {
    const { data } = await supabase.from("listening_tests").select("id, title").in("id", missing);
    for (const t of data ?? []) titleOf.set(t.id, t.title);
  }

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Listening</h1>
        <p className="text-muted-foreground">
          Four recorded parts and 40 questions. Exam mode plays each part once, as on test day; practice mode lets you replay.
        </p>
      </div>

      {allowance && <AllowanceMeter module="Listening" used={allowance.used} limit={allowance.limit} />}

      <section aria-label="Tests">
        {!tests?.length ? (
          <p className="text-muted-foreground">No Listening tests yet. New tests are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {tests.map((t) => {
              const open = planAllows(plan, t.min_plan);
              const s = summary.get(t.id);
              return (
                <li key={t.id} className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-5 shadow-sm" data-testid="listening-test">
                  {t.min_plan !== "free" && (
                    <div>
                      <Badge variant="outline">
                        {!open && <Lock aria-hidden />}
                        {planLabel(t.min_plan)}
                      </Badge>
                    </div>
                  )}
                  <h2 className="text-h3">{t.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {s ? `Taken ${s.count} ${s.count === 1 ? "time" : "times"} · best band ${s.best.toFixed(1)}` : "Not taken yet"}
                  </p>
                  {open ? (
                    <Link
                      href={listeningTestPath(t.id)}
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
