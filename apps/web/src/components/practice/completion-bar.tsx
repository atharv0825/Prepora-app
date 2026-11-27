import styles from "./completion-bar.module.css";
import { type PracticeModule, THEMES } from "./themes";

// Practice list headers (Reading, Listening, Writing, Speaking): how many of the listed items the
// student has completed, as a compact 3D green bar beside the page title. The percentage rides on
// the end of the fill as it grows. completed ÷ listed, so it adjusts by itself when admins publish
// more. Server component; CSS-only animation, skipped with reduced motion.

export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

export function CompletionBar({
  completed,
  total,
  noun,
  ariaLabel,
  testId,
  className,
  module,
}: {
  completed: number;
  total: number;
  /** Singular and plural, e.g. ["Academic test", "Academic tests"]. */
  noun: [string, string];
  /** The progress bar's name, e.g. "Reading tests completed". */
  ariaLabel: string;
  testId: string;
  /** The section, for its colour (Reading blue, Listening amber, Writing pink, Speaking green). Green without one. */
  module?: PracticeModule;
  className?: string;
}) {
  // Nothing published yet: nothing to complete, so no bar.
  if (total === 0) return null;
  const pct = completionPercent(completed, total);
  // Section colours inline (themes.ts), like the cards: they can't go missing with stale CSS.
  const theme = module ? THEMES[module] : null;
  const bubbleStyle = theme
    ? {
        backgroundImage: `linear-gradient(to bottom, ${theme.from}, ${theme.to})`,
        color: theme.text === "light" ? "#ffffff" : "#08222b",
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.5), 0 4px 8px -4px rgb(${theme.rgb} / 0.8)`,
      }
    : undefined;
  const fillStyle = theme
    ? { backgroundImage: `linear-gradient(to bottom, ${theme.from}, ${theme.to})`, boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.45), 0 1px 2px rgb(${theme.rgb} / 0.5)` }
    : undefined;
  const label = `${completed} of ${total} ${total === 1 ? noun[0] : noun[1]} completed`;

  return (
    <div className={`flex w-full flex-col gap-1.5 sm:w-72 ${className ?? ""}`}>
      {/* The bubble rides on the end of the fill (kept inside the bar at 0% and 100%). */}
      <div className="relative h-6">
        <span
          aria-hidden
          className={`absolute bottom-0 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#62d7a5] to-brand-primary px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-ink tabular-nums ring-1 ring-black/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_4px_8px_-4px_rgb(15_164_103/0.8)] ${styles.bubble}`}
          style={{ left: `clamp(1.25rem, ${pct}%, calc(100% - 1.25rem))`, ...bubbleStyle }}
        >
          {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%: ${label}`}
        className="h-3.5 overflow-hidden rounded-full bg-muted p-0.5 shadow-[inset_0_2px_3px_rgb(8_34_43/0.18),inset_0_-1px_0_rgb(255_255_255/0.7)] dark:shadow-[inset_0_2px_3px_rgb(0_0_0/0.45)]"
      >
        {pct > 0 && (
          <div
            className={`h-full rounded-full bg-gradient-to-b from-[#62d7a5] via-brand-primary to-brand-logo shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(15_164_103/0.5)] ${styles.fill}`}
            style={{ width: `${pct}%`, ...fillStyle }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid={testId}>
        {label} · {pct}%
      </p>
    </div>
  );
}
