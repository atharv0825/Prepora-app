import type { Metadata } from "next";
import { CalendarDays, ListChecks } from "lucide-react";
import { studyItemKinds } from "@prepora/shared/api/study-plan";
import { cn } from "@prepora/ui/lib/utils";
import { GetPlanButton, RestartPlanButton } from "@/components/plan/plan-buttons";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import { KIND_STYLE } from "@/components/plan/plan-style";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { getMyStudyPlan } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Study plan · Prepora", robots: { index: false } };

// M8.7-F2: the student's study plan. The first visit offers "Get my study plan" (the server picks
// one of the plans at random); after that: today's checklist (carried-over items first), the
// week ahead and progress. The plan's name and the other plans are never shown.
export default async function PlanPage() {
  const plan = await getMyStudyPlan();

  if (!plan) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 pb-16">
        <h1 className="text-h1">Study plan</h1>
        <p className="text-muted-foreground">Your plan couldn&apos;t be loaded just now. Please try again.</p>
      </div>
    );
  }

  if (!plan.active) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
        <div className="flex max-w-2xl flex-col gap-2">
          <h1 className="text-h1">Study plan</h1>
          <p className="text-muted-foreground">
            Not sure what to practise next? Get a day-by-day plan that covers Reading, Listening, Writing and Speaking. Each day picks
            tests and topics you haven&apos;t done yet.
          </p>
        </div>
        <section aria-label="Get a plan" className="flex max-w-xl flex-col gap-4 rounded-3xl bg-card p-6 shadow-xs ring-2 ring-primary/70">
          <span aria-hidden className="grid size-12 place-items-center rounded-full bg-accent text-accent-green ring-4 ring-primary/15">
            <ListChecks className="size-5" />
          </span>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>A few short tasks each day, in all four modules.</li>
            <li>Only tests and topics you haven&apos;t done yet.</li>
            <li>Missed a day? It carries over to the next.</li>
          </ul>
          <GetPlanButton />
        </section>
      </div>
    );
  }

  const left = plan.items.filter((i) => !i.done).length;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      <PracticeHeader
        title="Your study plan"
        progress={
          <CompletionBar
            completed={plan.progress.done}
            total={plan.progress.total}
            noun={["plan task", "plan tasks"]}
            ariaLabel="Study plan completed"
            testId="plan-progress"
          />
        }
      >
        <p className="flex items-center gap-2" data-testid="plan-day">
          <CalendarDays className="size-4" aria-hidden />
          Day {plan.day} of {plan.days}
          {plan.finished ? " · Plan complete. Well done!" : left === 0 ? " · All done for today" : ` · ${left} left today`}
        </p>
      </PracticeHeader>

      <section aria-labelledby="today-heading" className="flex flex-col gap-3">
        <h2 id="today-heading" className="text-h3">
          Today
        </h2>
        {plan.items.length === 0 ? (
          <p className="text-muted-foreground">Nothing planned for today.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {plan.items.map((item) => (
              <li key={`${item.day}-${item.order}`}>
                <PlanItemCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {plan.week.length > 0 && (
        <section aria-labelledby="week-heading" className="flex flex-col gap-3">
          <h2 id="week-heading" className="text-h3">
            Coming up
          </h2>
          <ol className="flex flex-col divide-y divide-border rounded-2xl bg-card ring-1 ring-border" data-testid="plan-week">
            {plan.week.map((d) => (
              <li key={d.day} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-14 shrink-0 font-medium">Day {d.day}</span>
                <span className="flex flex-wrap gap-2">
                  {d.kinds.map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                      <span aria-hidden className={cn("size-2 rounded-full", KIND_STYLE[k].dot)} />
                      {studyItemKinds[k].label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <RestartPlanButton />
    </div>
  );
}
