import Link from "next/link";
import { ArrowRight, ArrowUpRight, ListChecks } from "lucide-react";
import { type MyStudyPlan, planPercent, studyItemKinds } from "@prepora/shared/api/study-plan";
import { cn } from "@prepora/ui/lib/utils";
import { KIND_STYLE } from "@/components/plan/plan-style";
import { routes } from "@/lib/routes";
import { studyItemHref } from "@/lib/study";

// M8.7-F3: the dashboard's "Today's plan" card. With a plan: the day, what's left today, progress
// and Start for the next item. Without one: a small invitation to follow a study plan.

const card = "flex flex-col gap-4 rounded-3xl bg-card p-5 text-card-foreground shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-6";

export function TodaysPlanCard({ plan, className, style }: { plan: MyStudyPlan | null; className?: string; style?: React.CSSProperties }) {
  if (!plan) return null;

  if (!plan.active) {
    return (
      <section aria-labelledby="plan-heading" className={cn(card, className)} style={style} data-testid="plan-invite">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-green ring-4 ring-primary/15">
            <ListChecks className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="plan-heading" className="text-base font-medium">
              Follow a study plan
            </h2>
            <p className="text-sm text-muted-foreground">A few tasks a day across all four modules, picked from what you haven&apos;t done yet.</p>
          </div>
        </div>
        <Link
          href={routes.plan}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-muted px-4 py-2 text-sm font-medium transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-ring sm:self-center"
        >
          Get my plan <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </section>
    );
  }

  const left = plan.items.filter((i) => !i.done);
  const next = left.find((i) => i.item_id);
  const pct = planPercent(plan.progress);
  return (
    <section aria-labelledby="plan-heading" className={cn(card, className)} style={style} data-testid="plan-card">
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground ring-4 ring-primary/20">
          <ListChecks className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="plan-heading" className="text-base font-medium">
            Today&apos;s plan
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="plan-summary">
            Day {plan.day} of {plan.days} · {left.length === 0 ? "All done for today" : `${left.length} left today`} · {pct}% of the plan
          </p>
          <span aria-hidden className="block h-2 w-full max-w-xs overflow-hidden rounded-full bg-muted">
            {pct > 0 && <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {next && (
          <Link
            href={studyItemHref(next.kind, next.item_id!, next.extra)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-ink px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-white/15"
          >
            <span aria-hidden className={cn("size-2 rounded-full", KIND_STYLE[next.kind].dot)} />
            Start: {studyItemKinds[next.kind].label} <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
        <Link href={routes.plan} className="rounded-full px-3 py-2 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Open plan
        </Link>
      </div>
    </section>
  );
}
