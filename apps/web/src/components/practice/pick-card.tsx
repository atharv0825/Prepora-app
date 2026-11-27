import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";
import { cn } from "@prepora/ui/lib/utils";
import { MODULE_STYLE } from "@/components/dashboard/module-style";
import { pickPath } from "@/lib/routes";

// M8.7-F1 "Pick for me": the first card in a practice list. A white card outlined in the module's
// dashboard colour (like the outlined full test tile), the module colour on its icon. It opens a
// random item the student hasn't done yet (the /app/pick route asks pick_next).

const OUTLINE = {
  reading: "ring-chart-reading/70",
  listening: "ring-chart-listening/70",
  writing: "ring-chart-writing/70",
  speaking: "ring-chart-speaking/70",
} as const;

export function PickCard({ kind, module, note }: { kind: StudyItemKind; module: keyof typeof OUTLINE; note: string }) {
  const style = MODULE_STYLE[module];
  return (
    <Link
      href={pickPath(kind)}
      prefetch={false}
      className={cn(
        "group flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl bg-card p-4 text-card-foreground shadow-xs ring-2 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        OUTLINE[module],
      )}
      data-testid="pick-for-me"
    >
      <span className="flex items-start gap-3">
        <span aria-hidden className={cn("grid size-10 shrink-0 place-items-center rounded-full", style.bg, style.onBg)}>
          <Shuffle className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[0.9375rem] leading-snug font-semibold">Pick for me</span>
          <span className="text-xs text-muted-foreground">{note}</span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium">Random · not done yet</span>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-ink text-white transition-transform group-hover:translate-x-0.5 dark:bg-white/15">
          <ArrowRight className="size-4" />
        </span>
      </span>
    </Link>
  );
}
