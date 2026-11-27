import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { type PlanItem, studyItemKinds } from "@prepora/shared/api/study-plan";
import { cn } from "@prepora/ui/lib/utils";
import { studyItemHref } from "@/lib/study";
import { KIND_STYLE } from "./plan-style";

// One item of today's plan: a white card outlined in its module's colour, the module colour on
// its icon, what it is, the picked content, and Start (or Done ✓).

export function PlanItemCard({ item }: { item: PlanItem }) {
  const style = KIND_STYLE[item.kind];
  const Icon = style.icon;
  const href = item.item_id ? studyItemHref(item.kind, item.item_id, item.extra) : null;
  return (
    <div
      className={cn("flex h-full flex-col gap-4 rounded-2xl bg-card p-4 text-card-foreground shadow-xs ring-2", item.done ? "ring-border opacity-80" : style.outline)}
      data-testid="plan-item"
      data-done={item.done || undefined}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full", style.circle)}>
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            {studyItemKinds[item.kind].label}
            {item.carried && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-amber-900">From day {item.day}</span>}
          </span>
          <span className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold">{item.title ?? "Nothing to practise here yet"}</span>
        </span>
      </span>
      <span className="mt-auto flex items-center justify-end">
        {item.done ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            <Check className="size-3.5" aria-hidden /> Done
          </span>
        ) : href ? (
          <Link
            href={href}
            aria-label={`Start: ${item.title ?? studyItemKinds[item.kind].label}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:bg-white/15"
          >
            Start <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">New content is added regularly.</span>
        )}
      </span>
    </div>
  );
}
