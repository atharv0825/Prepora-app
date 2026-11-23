import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Coins, Headphones, Mic, PenLine, type LucideIcon } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { cn } from "@prepora/ui/lib/utils";
import type { DashboardModule, ExamCountdown, ModuleKey } from "@/lib/dashboard";

// Home dashboard cards (M2-F3, UI design: greeting, target band + exam countdown card, 2×2
// module tiles with the recommended one in green). Server components: no client JS.

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

export function CreditsCard({ plan }: { plan: string }) {
  // Placeholder until the credits engine (M3): no balance exists yet, so none is shown.
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
        <div className="flex flex-col gap-1">
          <p className="font-medium">Coming soon</p>
          <p className="text-sm text-muted-foreground">
            Credits pay for AI scoring of Writing and Speaking. Your balance will show here.
          </p>
        </div>
      </div>
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
            recommended ? "bg-white/25" : "bg-white text-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {available ? (
          <ArrowRight className="size-5" aria-hidden />
        ) : (
          <Badge variant="outline" className="bg-white/60">
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
