import styles from "./reading-progress.module.css";

// Reading list header (replaces the monthly-limit meter there): how many of the listed tests the
// student has completed, as a compact 3D green bar beside the page title. The percentage rides on
// the end of the fill as it grows. completed ÷ listed, so it adjusts by itself when admins publish
// more tests. Server component; CSS-only animation, skipped with reduced motion.

export function completionPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(completed, total) / total) * 100);
}

export function ReadingProgress({ completed, total, scope, className }: { completed: number; total: number; scope: string; className?: string }) {
  const pct = completionPercent(completed, total);
  const label = `${completed} of ${total} ${scope} test${total === 1 ? "" : "s"} completed`;

  return (
    <div className={`flex w-full flex-col gap-1.5 sm:w-72 ${className ?? ""}`}>
      {/* The bubble rides on the end of the fill (kept inside the bar at 0% and 100%). */}
      <div className="relative h-6">
        <span
          aria-hidden
          className={`absolute bottom-0 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#62d7a5] to-brand-primary px-2 py-0.5 text-[0.6875rem] font-semibold text-brand-ink tabular-nums ring-1 ring-black/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_4px_8px_-4px_rgb(15_164_103/0.8)] ${styles.bubble}`}
          style={{ left: `clamp(1.25rem, ${pct}%, calc(100% - 1.25rem))` }}
        >
          {pct}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Reading tests completed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%: ${label}`}
        className="h-3.5 overflow-hidden rounded-full bg-muted p-0.5 shadow-[inset_0_2px_3px_rgb(8_34_43/0.18),inset_0_-1px_0_rgb(255_255_255/0.7)] dark:shadow-[inset_0_2px_3px_rgb(0_0_0/0.45)]"
      >
        {pct > 0 && (
          <div
            className={`h-full rounded-full bg-gradient-to-b from-[#62d7a5] via-brand-primary to-brand-logo shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(15_164_103/0.5)] ${styles.fill}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="reading-progress">
        {label} · {pct}%
      </p>
    </div>
  );
}
