import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Check, Coins, Flame, Headphones, Mic, PenLine, type LucideIcon } from "lucide-react";
import { type CreditBalance, spendableToday } from "@prepora/shared/api/credits";
import { type Streak, lastSevenDays, streakMessage } from "@prepora/shared/api/streak";
import { Badge } from "@prepora/ui/components/badge";
import { cn } from "@prepora/ui/lib/utils";
import type { DashboardModule, ExamCountdown, ModuleKey } from "@/lib/dashboard";
import { routes } from "@/lib/routes";

// Home dashboard cards (M2-F3, UI design: greeting, target band + exam countdown card, 2×2
// module tiles with the recommended one in green), credits card (M3-F1). Server components: no
// client JS.

const cardClass = "flex flex-col gap-4 rounded-3xl border border-border bg-card p-6";

export function GoalCard({
  targetBand,
  testType,
  countdown,
}: {
  targetBand: string | null;
  testType: string | null;
  countdown: ExamCountdown;
}) {
  return (
    <section aria-labelledby="goal-heading" className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="goal-heading" className="text-eyebrow text-muted-foreground">
          Your goal
        </h2>
        {testType && <Badge variant="secondary">{testType}</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Target band</p>
          <p className="text-h2 tabular-nums">{targetBand ?? "—"}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden /> Exam
          </p>
          <Countdown countdown={countdown} />
        </div>
      </div>
    </section>
  );
}

function Countdown({ countdown }: { countdown: ExamCountdown }) {
  switch (countdown.kind) {
    case "upcoming":
      return (
        <p>
          <span className="text-h2 tabular-nums">{countdown.days}</span>{" "}
          <span className="text-muted-foreground">{countdown.days === 1 ? "day to go" : "days to go"}</span>
        </p>
      );
    case "today":
      return <p className="text-h3">Today. Good luck!</p>;
    case "past":
      return <p className="text-muted-foreground">Your exam date has passed.</p>;
    case "none":
      return <p className="text-muted-foreground">Not booked yet</p>;
  }
}

/** Balance, what's left today and a link to "Credits & usage" (M3-F1). */
export function CreditsCard({ plan, credits }: { plan: string; credits: CreditBalance | null }) {
  return (
    <section aria-labelledby="credits-heading" className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="credits-heading" className="text-eyebrow text-muted-foreground">
          AI credits
        </h2>
        <Badge variant="outline">{plan} plan</Badge>
      </div>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
          <Coins className="size-5" aria-hidden />
        </span>
        {credits ? (
          <div className="flex flex-col gap-1">
            <p>
              <span className="text-h2 tabular-nums">{credits.balance}</span>{" "}
              <span className="text-muted-foreground">{credits.balance === 1 ? "credit" : "credits"}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              {spendableToday(credits)} left to use today. Credits pay for AI scoring of Writing and Speaking.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Your balance couldn&apos;t be loaded just now.</p>
        )}
      </div>
      <Link href={routes.credits} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        Credits &amp; usage <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}

const weekday = (date: string, style: "narrow" | "long") =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: style, timeZone: "UTC" });

/** Days in a row with any scored practice, the best run, and this week at a glance. */
export function StreakCard({ streak, className }: { streak: Streak | null; className?: string }) {
  return (
    <section aria-labelledby="streak-heading" className={cn(cardClass, className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="streak-heading" className="text-eyebrow text-muted-foreground">
          Practice streak
        </h2>
        {streak && streak.longest > 0 && <Badge variant="outline">Best: {streak.longest} {streak.longest === 1 ? "day" : "days"}</Badge>}
      </div>
      {streak ? (
        <>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                streak.current > 0 ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
              )}
            >
              <Flame className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p>
                <span className="text-h2 tabular-nums" data-testid="streak-current">{streak.current}</span>{" "}
                <span className="text-muted-foreground">{streak.current === 1 ? "day" : "days"} in a row</span>
              </p>
              <p className="text-sm text-muted-foreground">{streakMessage(streak)}</p>
            </div>
          </div>
          <ol className="grid grid-cols-7 gap-1.5" aria-label="The last 7 days">
            {lastSevenDays(streak).map((d) => (
              <li
                key={d.date}
                className="flex flex-col items-center gap-1"
                aria-label={`${d.today ? "Today" : weekday(d.date, "long")}: ${d.practised ? "practised" : "no practice"}`}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 place-items-center rounded-full border text-xs",
                    d.practised ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    d.today && !d.practised && "border-dashed border-primary",
                  )}
                >
                  {d.practised && <Check className="size-4" />}
                </span>
                <span aria-hidden className={cn("text-xs", d.today ? "font-medium" : "text-muted-foreground")}>
                  {weekday(d.date, "narrow")}
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Your streak couldn&apos;t be loaded just now.</p>
      )}
    </section>
  );
}

const moduleIcons: Record<ModuleKey, LucideIcon> = {
  reading: BookOpen,
  listening: Headphones,
  writing: PenLine,
  speaking: Mic,
};

export function ModuleGrid({
  modules,
  recommended,
}: {
  modules: readonly DashboardModule[];
  recommended: ModuleKey | null;
}) {
  return (
    <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
      <h2 id="modules-heading" className="text-h3">
        Practise
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4">
        {modules.map((m) => (
          <li key={m.key}>
            <ModuleTile module={m} recommended={m.key === recommended} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModuleTile({ module: m, recommended }: { module: DashboardModule; recommended: boolean }) {
  const Icon = moduleIcons[m.key];
  const available = m.status === "available" && m.href;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-full",
            recommended ? "bg-white/25" : "bg-background text-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {available ? (
          <ArrowRight className="size-5" aria-hidden />
        ) : (
          <Badge variant="outline" className="bg-background/60">
            Coming soon
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium">{m.title}</h3>
        <p className={cn("text-sm", recommended ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {m.description}
        </p>
        {recommended && <p className="mt-1 text-xs font-medium">Recommended next</p>}
      </div>
    </>
  );
  const tileClass = cn(
    "flex h-full min-h-40 flex-col justify-between gap-6 rounded-3xl p-5 transition-colors",
    recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
  );

  if (available) {
    return (
      <Link href={m.href!} className={cn(tileClass, "hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/40")}>
        {body}
      </Link>
    );
  }
  return (
    <div className={tileClass} aria-disabled="true">
      {body}
    </div>
  );
}
