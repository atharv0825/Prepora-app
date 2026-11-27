import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";
import { pickPath } from "@/lib/routes";
import { accentStyle, pickStyle, type PracticeModule, SURFACE_CLASS } from "./themes";

// M8.7-F1 "Pick for me": the first card in a practice list, in the section's colour but different
// from the test cards: a stronger tint of the colour, outlined in it, with the colour on its icon
// and pill. It opens a random item the student hasn't done yet (the /app/pick route asks
// pick_next). Colours are inline styles (themes.ts), so they can't go missing.

export function PickCard({ kind, module, note }: { kind: StudyItemKind; module: PracticeModule; note: string }) {
  return (
    <Link
      href={pickPath(kind)}
      prefetch={false}
      style={pickStyle(module)}
      className={`${SURFACE_CLASS} group flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl p-4 text-brand-ink transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0 dark:text-foreground`}
      data-testid="pick-for-me"
      data-module={module}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden style={accentStyle(module)} className="grid size-10 shrink-0 place-items-center rounded-full">
          <Shuffle className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[0.9375rem] leading-snug font-semibold">Pick for me</span>
          <span className="text-xs text-brand-ink/75 dark:text-muted-foreground">{note}</span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span style={accentStyle(module)} className="rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold">
          Random · not done yet
        </span>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-ink text-white transition-transform group-hover:translate-x-0.5 dark:bg-white/15">
          <ArrowRight className="size-4" />
        </span>
      </span>
    </Link>
  );
}
