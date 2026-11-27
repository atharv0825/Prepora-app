import Link from "next/link";
import { ArrowRight, BookOpen, Lock, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { doneStyle, freshStyle, type PracticeModule, SURFACE_CLASS, THEMES } from "./themes";

export type { PracticeModule } from "./themes";

// One item in a practice list (Reading / Listening tests, Writing tasks, Speaking topics): a
// compact, glossy "3D" card with an icon circle, title, status, a small kind pill and an arrow.
//
//   not done   a glossy gradient in the section's dashboard colour (Reading blue with white text;
//              Listening amber, Writing pink, Speaking green with deep ink text)
//   done       a light tint of the same colour, so what's left to do stands out
//   locked     grey, with a lock; goes to the plans page
//
// The whole card is clickable through a "stretched" main link (its name says what it does:
// "Start test: …", "Take again: …", "Unlock with Gold"). An optional second link (Speaking's
// "Part 3") sits above it, so links are never nested.

export type PracticeCardProps = {
  /** The section, for its dashboard colour. */
  module: PracticeModule;
  href: string;
  title: string;
  /** The pill, e.g. "Academic", "Task 1 · Academic report", "Part 2". */
  kindLabel: string;
  /** "Not taken yet", "Taken 2 times · best band 7.0"… */
  status: string;
  done: boolean;
  /** The main link's name when not done / done, e.g. "Start test" / "Take again". */
  verbs?: { start: string; again: string };
  icon?: LucideIcon;
  /** A short muted line under the status, e.g. a cue card's points. */
  detail?: string;
  /** Set when the student's plan can't open it: the plan's name, e.g. "Gold". */
  lockedPlan?: string | null;
  /** A paid item the student can open: its plan, shown as a small tag. */
  planTag?: string | null;
  /** A second link on the card (e.g. Speaking Part 3). */
  extraLink?: { href: string; label: string; icon?: LucideIcon; testId?: string };
};

const base =
  "group relative flex h-full min-h-28 flex-col justify-between gap-3 rounded-2xl p-4 transition-[transform,box-shadow] duration-200 " +
  "hover:-translate-y-0.5 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0";

const DOT: Record<PracticeModule, string> = {
  reading: "bg-chart-reading",
  listening: "bg-chart-listening",
  writing: "bg-chart-writing",
  speaking: "bg-brand-logo",
};

const locked =
  "bg-gradient-to-b from-[#f7f7f6] to-[#ececea] text-brand-ink ring-1 ring-black/5 " +
  "shadow-[inset_0_1px_0_white,0_8px_18px_-12px_rgb(8_34_43/0.3)] " +
  "dark:from-[#1a5763] dark:to-[#164c58] dark:text-foreground dark:ring-white/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_10px_22px_-12px_rgb(0_0_0/0.6)]";

export function PracticeCard({
  module,
  href,
  title,
  kindLabel,
  status,
  done,
  verbs = { start: "Start test", again: "Take again" },
  icon: Icon = BookOpen,
  detail,
  lockedPlan,
  planTag,
  extraLink,
}: PracticeCardProps) {
  const look = lockedPlan ? "locked" : done ? "done" : "fresh";
  const label = lockedPlan ? `Unlock with ${lockedPlan}` : `${done ? verbs.again : verbs.start}: ${title}`;
  // "onGreen": on the coloured (not done) card, the inner pieces sit on the section colour.
  const onGreen = look === "fresh";
  const light = onGreen && THEMES[module].text === "light";
  const Extra = extraLink?.icon;
  // Colours come from inline styles (themes.ts): text classes only, so the text always has its
  // background. Done cards: a light tint (ink text), or in dark mode the dark card tinted (light text).
  const className =
    look === "locked" ? locked : look === "fresh" ? (light ? "text-white" : "text-brand-ink") : cn(SURFACE_CLASS, "text-brand-ink dark:text-foreground");
  const style = look === "fresh" ? freshStyle(module) : look === "done" ? doneStyle(module) : undefined;

  return (
    <div className={cn(base, className)} style={style} data-state={look} data-module={module}>
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            onGreen ? "bg-white/25 ring-1 ring-white/60" : "bg-white ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/15",
          )}
        >
          {lockedPlan ? <Lock className="size-4" /> : <Icon className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* The main link: its ::after covers the whole card. */}
          <Link href={href} aria-label={label} className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl">
            {title}
          </Link>
          <span className={cn("text-xs", light ? "text-white/85" : onGreen ? "text-brand-ink/75" : look === "done" ? "text-brand-ink/75 dark:text-muted-foreground" : "text-muted-foreground")}>{lockedPlan ? `${lockedPlan} plan` : status}</span>
          {detail && <span className={cn("line-clamp-2 text-xs", light ? "text-white/80" : onGreen ? "text-brand-ink/70" : look === "done" ? "text-brand-ink/70 dark:text-muted-foreground" : "text-muted-foreground")}>{detail}</span>}
        </span>
      </span>

      <span className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium",
              onGreen ? "bg-white/85 text-brand-ink ring-1 ring-black/5" : "bg-white text-brand-ink ring-1 ring-black/5 dark:bg-white/10 dark:text-foreground dark:ring-white/10",
            )}
          >
            <span aria-hidden className={cn("size-1.5 rounded-full", onGreen ? DOT[module] : done ? DOT[module] : "bg-muted-foreground")} />
            {kindLabel}
          </span>
          {planTag && !lockedPlan && (
            <span className={cn("rounded-full px-2 py-0.5 text-[0.6875rem] font-medium", onGreen ? "bg-white/50" : "bg-muted")}>{planTag}</span>
          )}
          {extraLink && !lockedPlan && (
            // Above the stretched link, so it's its own target.
            <Link
              href={extraLink.href}
              data-testid={extraLink.testId}
              className={cn(
                "relative z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
                onGreen ? "bg-brand-ink text-white ring-black/10 hover:bg-brand-ink/85" : "bg-brand-ink text-white ring-black/10 hover:bg-brand-ink/85",
              )}
            >
              {Extra && <Extra className="size-3" aria-hidden />}
              {extraLink.label}
            </Link>
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition-transform group-hover:translate-x-0.5",
            onGreen ? "bg-brand-ink text-white" : "bg-brand-ink text-white dark:bg-white/15",
          )}
        >
          <ArrowRight className="size-4" />
        </span>
      </span>
    </div>
  );
}
