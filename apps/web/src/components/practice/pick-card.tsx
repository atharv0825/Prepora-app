import Link from "next/link";
import { ArrowRight, Shuffle } from "lucide-react";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";
import { pickPath } from "@/lib/routes";
import { CARD_LAYER, patternStyle } from "./patterns";
import { accentStyle, CARD_3D_CLASS, LIFT_CLASS, pickStyle, type PracticeModule, SURFACE_CLASS } from "./themes";

// M8.7-F1 "Pick for me": the first card in a practice list, in the section's colour but different
// from the test cards: a stronger tint of the colour, outlined in it, with the colour on its icon
// and pill. It opens a random item the student hasn't done yet (the /app/pick route asks
// pick_next). Colours are inline styles (themes.ts), so they can't go missing. Same shape and
// 3D hover as the test cards (CARD_3D_CLASS).

export function PickCard({ kind, module, note }: { kind: StudyItemKind; module: PracticeModule; note: string }) {
  return (
    <Link
      href={pickPath(kind)}
      prefetch={false}
      style={{ ...CARD_LAYER, ...pickStyle(module) }}
      className={`${SURFACE_CLASS} ${LIFT_CLASS} ${CARD_3D_CLASS} group text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-foreground`}
      data-testid="pick-for-me"
      data-module={module}
    >
      {/* The same faint icon pattern as the test cards (pattern 0; the first test card uses 1). */}
      <span aria-hidden className="dark:invert" style={patternStyle(0, "soft")} />
      <span className="flex items-center gap-3.5">
        <span aria-hidden style={accentStyle(module)} className="grid size-14 shrink-0 place-items-center rounded-full">
          <Shuffle className="size-6" strokeWidth={1.5} />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[1.0625rem] leading-snug font-bold tracking-tight">Pick for me</span>
          <span className="text-[0.8125rem] text-brand-ink/75 dark:text-muted-foreground">{note}</span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span style={accentStyle(module)} className="rounded-full px-2.5 py-1 text-xs font-semibold">
          Random · not done yet
        </span>
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full text-white transition-transform duration-400 group-hover:translate-x-0.5 dark:bg-white/15!" style={{ backgroundColor: "#0b1220" }}>
          <ArrowRight className="size-5" />
        </span>
      </span>
    </Link>
  );
}
