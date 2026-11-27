import { Flame } from "lucide-react";
import { type Streak, STREAK_CALENDAR_DAYS, lastDays, streakMessage, weekdayIndex } from "@prepora/shared/api/streak";
import { cn } from "@prepora/ui/lib/utils";

// Profile "Practice streak" section (M8.5-F2): current and best streak, total practice days and a
// 12-week calendar (weeks as columns, Monday at the top, today outlined). Server component; the
// days come from get_my_streak(84), counted in the student's own time zone.

const fullDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ProfileStreak({ streak }: { streak: Streak | null }) {
  return (
    <section aria-labelledby="profile-streak-heading" className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 id="profile-streak-heading" className="text-h3">
          Practice streak
        </h2>
        <p className="text-sm text-muted-foreground">
          A day counts when you finish any scored Reading, Listening, Writing or Speaking practice.
        </p>
      </div>
      {streak ? <StreakDetails streak={streak} /> : <p className="text-sm text-muted-foreground">Your streak couldn&apos;t be loaded just now.</p>}
    </section>
  );
}

function StreakDetails({ streak }: { streak: Streak }) {
  const days = lastDays(streak, STREAK_CALENDAR_DAYS);
  const practised = days.filter((d) => d.practised).length;
  // Blank cells before the first day so every column is a Monday-to-Sunday week.
  const lead = weekdayIndex(days[0]!.date);

  return (
    <>
      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Current" value={streak.current} unit={streak.current === 1 ? "day" : "days"} testId="profile-streak-current" highlight={streak.current > 0} />
        <Stat label="Best" value={streak.longest} unit={streak.longest === 1 ? "day" : "days"} testId="profile-streak-best" />
        <Stat label="All time" value={streak.total_days} unit={streak.total_days === 1 ? "day" : "days"} testId="profile-streak-total" />
      </dl>
      <p className="text-sm text-muted-foreground">{streakMessage(streak)}</p>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          Last 12 weeks <span className="font-normal text-muted-foreground">· {plural(practised, "practice day", "practice days")}</span>
        </p>
        <div className="flex gap-2">
          <div aria-hidden className="grid grid-rows-7 gap-1 text-[0.625rem] leading-none text-muted-foreground">
            {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, i) => (
              <span key={i} className="flex h-4 items-center sm:h-5">
                {label}
              </span>
            ))}
          </div>
          <ol aria-label="Practice in the last 12 weeks" className="grid grid-flow-col grid-rows-7 gap-1">
            {Array.from({ length: lead }, (_, i) => (
              <li key={`lead-${i}`} aria-hidden className="size-4 sm:size-5" />
            ))}
            {days.map((d) => (
              <li
                key={d.date}
                aria-label={`${d.today ? "Today, " : ""}${fullDate(d.date)}: ${d.practised ? "practised" : "no practice"}`}
                title={`${fullDate(d.date)}${d.practised ? " · practised" : ""}`}
                className={cn(
                  "size-4 rounded-[0.25rem] border sm:size-5",
                  d.practised ? "border-primary bg-primary" : "border-border bg-muted",
                  d.today && "ring-2 ring-foreground ring-offset-1 ring-offset-background",
                )}
              />
            ))}
          </ol>
        </div>
        <p aria-hidden className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-[0.2rem] border border-border bg-muted" /> No practice
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-[0.2rem] border border-primary bg-primary" /> Practised
          </span>
        </p>
      </div>
    </>
  );
}

function Stat({ label, value, unit, testId, highlight }: { label: string; value: number; unit: string; testId: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-3">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">
        {highlight && <Flame className="size-3.5 text-primary" aria-hidden />}
        {label}
      </dt>
      <dd>
        <span className="text-h3 tabular-nums" data-testid={testId}>
          {value}
        </span>{" "}
        <span className="text-xs text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
