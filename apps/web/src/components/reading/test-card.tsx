import Link from "next/link";
import { ArrowRight, BookOpen, Lock } from "lucide-react";
import { cn } from "cn";

// One Reading test in the list: a compact, glossy "3D" card (icon circle, title, status, a small
// type pill and an arrow). The whole card is the link into the test.
//
//   not taken  solid green with a top highlight and a soft drop shadow (deep ink text: never
//              white on the green, UI design "Using the colours")
//   taken      the same card in light mint, so what's left to do stands out
//   locked     grey, with a lock; goes to the plans page
//
// The link's name says what it does ("Start test: …", "Take again: …", "Unlock with Gold"),
// so the card reads the same to screen readers as the old buttons did.

export type TestCardProps = {
  href: string;
  title: string;
  /** "Academic" or "General Training". */
  typeLabel: string;
  /** "Not taken yet" or "Taken 2 times · best band 7.0". */
  status: string;
  taken: boolean;
  /** Set when the student's plan can't open it: the plan's name, e.g. "Gold". */
  lockedPlan?: string | null;
  /** A paid test the student can open: its plan, shown as a small tag. */
  planTag?: string | null;
};

const base =
  "group relative flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl p-4 transition-[transform,box-shadow] duration-200 " +
  "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const looks = {
  fresh:
    "bg-gradient-to-b from-[#62d7a5] to-brand-primary text-brand-ink ring-1 ring-black/5 " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-2px_0_rgb(8_34_43/0.08),0_10px_22px_-12px_rgb(15_164_103/0.75)] " +
    "hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-2px_0_rgb(8_34_43/0.08),0_16px_28px_-12px_rgb(15_164_103/0.8)]",
  taken:
    "bg-gradient-to-b from-white to-brand-foam text-brand-ink ring-1 ring-brand-mist " +
    "shadow-[inset_0_1px_0_white,0_8px_18px_-12px_rgb(8_34_43/0.35)] hover:shadow-[inset_0_1px_0_white,0_14px_24px_-12px_rgb(8_34_43/0.4)] " +
    "dark:from-[#164c58] dark:to-[#0f3b47] dark:text-foreground dark:ring-white/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_10px_22px_-12px_rgb(0_0_0/0.6)]",
  locked:
    "bg-gradient-to-b from-[#f7f7f6] to-[#ececea] text-brand-ink ring-1 ring-black/5 " +
    "shadow-[inset_0_1px_0_white,0_8px_18px_-12px_rgb(8_34_43/0.3)] " +
    "dark:from-[#1a5763] dark:to-[#164c58] dark:text-foreground dark:ring-white/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_10px_22px_-12px_rgb(0_0_0/0.6)]",
};

export function TestCard({ href, title, typeLabel, status, taken, lockedPlan, planTag }: TestCardProps) {
  const look = lockedPlan ? "locked" : taken ? "taken" : "fresh";
  const label = lockedPlan ? `Unlock with ${lockedPlan}` : `${taken ? "Take again" : "Start test"}: ${title}`;
  const onGreen = look === "fresh";

  return (
    <Link href={href} aria-label={label} className={cn(base, looks[look])} data-state={look}>
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            onGreen ? "bg-white/25 ring-1 ring-white/60" : "bg-white ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/15",
          )}
        >
          {lockedPlan ? <Lock className="size-4" /> : <BookOpen className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold">{title}</span>
          <span className={cn("text-xs", onGreen ? "text-brand-ink/75" : "text-muted-foreground")}>{lockedPlan ? `${lockedPlan} plan` : status}</span>
        </span>
      </span>

      <span className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
              onGreen ? "bg-white/85 text-brand-ink" : "bg-white text-brand-ink ring-1 ring-black/5 dark:bg-white/10 dark:text-foreground dark:ring-white/10",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", onGreen ? "bg-brand-logo" : taken ? "bg-brand-primary" : "bg-muted-foreground")} />
            {typeLabel}
          </span>
          {planTag && !lockedPlan && (
            <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", onGreen ? "bg-white/50" : "bg-muted")}>{planTag}</span>
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-0.5",
            onGreen ? "bg-brand-ink text-white" : "bg-brand-ink/90 text-white dark:bg-white/15",
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </span>
    </Link>
  );
}
