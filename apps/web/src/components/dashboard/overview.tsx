import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  Flame,
  Target,
  type LucideIcon,
} from "lucide-react";
import {
  type DashboardStats,
  type DayStats,
  estimatedBand,
  practiceShares,
  totalPractice,
  weekSummary,
} from "@prepora/shared/api/dashboard";
import { type Streak, lastSevenDays, streakMessage } from "@prepora/shared/api/streak";
import { ieltsRound } from "@prepora/shared/ielts/bands";
import { cn } from "@prepora/ui/lib/utils";
import type { ExamCountdown } from "@/lib/dashboard";
import { formatBand } from "@/lib/onboarding";
import { MODULE_STYLE, hatch } from "./module-style";
import { routes } from "@/lib/routes";

// Home dashboard overview (M8.6): two stat cards (goal, streak) and three chart cards
// (band by module, practice mix, this week). Server components; the charts are plain SVG/CSS
// with CSS-only hover, every value is also written out as text (legend rows, labels), so
// nothing depends on colour or hover alone.
//
// Colours: one per module (chart-reading/listening/writing/speaking in packages/ui), checked
// with the dataviz palette validator in light and dark; marks carry a hatch texture as well.

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────
const cardClass = "flex flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground shadow-xs sm:p-6";

const MODULES = MODULE_STYLE;

const weekday = (date: string, style: "narrow" | "short" | "long") =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: style, timeZone: "UTC" });
const dayMonth = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function IconCircle({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span className={cn("grid size-12 shrink-0 place-items-center rounded-full ring-4", className)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

function CornerLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowUpRight className="size-4" aria-hidden />
    </Link>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("rounded-full bg-muted px-3 py-1 text-xs font-medium", className)}>{children}</span>;
}

/** ↑ / ↓ change next to a number; the words are for screen readers. */
function Change({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  if (value === 0) return null;
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-accent-green" : "text-destructive")}>
      <Icon className="size-3" aria-hidden />
      {Math.abs(value)}
      {suffix}
      <span className="sr-only">
        {" "}
        {up ? "up" : "down"} {label}
      </span>
    </span>
  );
}

function StatHeader({ id, title, icon, iconClass, link }: { id: string; title: string; icon: LucideIcon; iconClass: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <IconCircle icon={icon} className={iconClass} />
        <h2 id={id} className="max-w-[7rem] text-base leading-snug font-medium">
          {title}
        </h2>
      </div>
      {link && <CornerLink {...link} />}
    </div>
  );
}

// ── Stat cards ──────────────────────────────────────────────────────────────────────────────
export function GoalCard({
  targetBand,
  testType,
  countdown,
  estimate,
  className,
}: {
  className?: string;
  targetBand: string | null;
  testType: string | null;
  countdown: ExamCountdown;
  estimate: number | null;
}) {
  return (
    <section aria-labelledby="goal-heading" className={cn(cardClass, className)}>
      <StatHeader id="goal-heading" title="Your goal" icon={Target} iconClass="bg-primary text-primary-foreground ring-primary/20" />
      <p className="flex items-start gap-2">
        <span className="text-5xl leading-none font-light tracking-tight tabular-nums">{targetBand ?? "—"}</span>
        <span className="pt-1 text-sm text-muted-foreground">
          target band
          {estimate !== null && targetBand !== null && (
            <span className="block text-xs">
              Your estimate: <span className="font-medium text-foreground">{formatBand(estimate)}</span>
            </span>
          )}
        </span>
      </p>
      <div className="mt-auto flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          <Countdown countdown={countdown} />
        </p>
        {testType && <Pill>{testType}</Pill>}
      </div>
    </section>
  );
}

function Countdown({ countdown }: { countdown: ExamCountdown }) {
  switch (countdown.kind) {
    case "upcoming":
      return (
        <span>
          Exam: <span className="font-medium text-foreground tabular-nums">{countdown.days}</span> {countdown.days === 1 ? "day to go" : "days to go"}
        </span>
      );
    case "today":
      return <span className="font-medium text-foreground">Exam today. Good luck!</span>;
    case "past":
      return <span>Your exam date has passed.</span>;
    case "none":
      return <span>Exam: Not booked yet</span>;
  }
}

/** Days in a row with any scored practice, the best run, and this week at a glance (M8.5-F1). */
export function StreakCard({ streak, className }: { streak: Streak | null; className?: string }) {
  return (
    <section aria-labelledby="streak-heading" className={cn(cardClass, className)}>
      <StatHeader
        id="streak-heading"
        title="Practice streak"
        icon={Flame}
        iconClass="bg-accent-pink text-brand-ink ring-accent-pink/25"
        link={{ href: routes.profile, label: "Streak calendar on your profile" }}
      />
      {streak ? (
        <>
          <div className="flex flex-col gap-1">
            <p className="flex items-start gap-2">
              <span className="text-5xl leading-none font-light tracking-tight tabular-nums" data-testid="streak-current">
                {streak.current}
              </span>{" "}
              <span className="pt-1 text-sm text-muted-foreground">
                {streak.current === 1 ? "day" : "days"} in a row
                {streak.longest > 0 && <span className="block text-xs">Best: {plural(streak.longest, "day", "days")}</span>}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">{streakMessage(streak)}</p>
          </div>
          <ol className="mt-auto flex items-center justify-between gap-1" aria-label="The last 7 days">
            {lastSevenDays(streak).map((d) => (
              <li
                key={d.date}
                className="flex flex-col items-center gap-1"
                aria-label={`${d.today ? "Today" : weekday(d.date, "long")}: ${d.practised ? "practised" : "no practice"}`}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-8 place-items-center rounded-full border-2 border-card",
                    d.practised ? "bg-accent-pink text-brand-ink" : "bg-muted",
                    d.today && "outline-2 outline-offset-1 outline-foreground",
                    d.today && !d.practised && "outline-dashed",
                  )}
                >
                  {d.practised && <Check className="size-4" />}
                </span>
                <span aria-hidden className={cn("text-[0.6875rem]", d.today ? "font-semibold" : "text-muted-foreground")}>
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

// ── Band by module ──────────────────────────────────────────────────────────────────────────
/** A module's recent average shown the IELTS way (half bands: 7.75 → 8.0), or null. */
const moduleBand = (recent: number | null) => (recent !== null ? ieltsRound(recent) : null);

export function BandCard({ stats, className }: { stats: DashboardStats | null; className?: string }) {
  const estimate = stats ? estimatedBand(stats.modules) : null;
  return (
    <section aria-labelledby="bands-heading" className={cn(cardClass, className)}>
      <h2 id="bands-heading" className="text-lg font-medium">
        Band by module
      </h2>
      {!stats ? (
        <Unavailable />
      ) : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-5xl leading-none font-light tracking-tight tabular-nums" data-testid="estimated-band">
                {estimate ? formatBand(estimate.band) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {estimate
                  ? `Estimated band, from ${estimate.from} of 4 modules`
                  : "Finish a test to see your estimated band"}
              </p>
            </div>
            {/* The values as text: the chart below is the same numbers drawn. */}
            <ul className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2" aria-label="Recent band by module">
              {stats.modules.map((m) => {
                const meta = MODULES[m.module];
                return (
                  <li key={m.module} className="flex items-center gap-2">
                    <span className={cn("grid size-6 place-items-center rounded-full", meta.bg, meta.onBg)} style={hatch} aria-hidden>
                      <meta.icon className="size-3.5" />
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="text-[0.6875rem] text-muted-foreground">{meta.label}</span>
                      <span className="text-sm font-medium tabular-nums">{m.recent_band !== null ? formatBand(moduleBand(m.recent_band)!) : "—"}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {/* Bars: height = recent band out of 9. Decorative copy of the list above. */}
          <div className="grid min-h-40 flex-1 grid-cols-4 items-end gap-2" aria-hidden>
            {stats.modules.map((m) => {
              const meta = MODULES[m.module];
              const shown = moduleBand(m.recent_band);
              const pct = shown !== null ? Math.max(12, (shown / 9) * 100) : 0;
              return (
                <div key={m.module} className="group relative flex h-full flex-col justify-end">
                  {shown !== null ? (
                    <div className={cn("relative rounded-2xl", meta.bg)} style={{ height: `${pct}%`, ...hatch }}>
                      <span className="absolute top-2 left-2 rounded-full bg-card px-2 py-0.5 text-[0.6875rem] font-medium text-card-foreground tabular-nums">
                        {formatBand(shown!)}
                      </span>
                    </div>
                  ) : (
                    <div className="grid h-[12%] min-h-8 place-items-center rounded-2xl border-2 border-dashed border-border text-xs text-muted-foreground">
                      —
                    </div>
                  )}
                  <Tooltip>
                    {meta.label}: {shown !== null ? `${formatBand(shown)}, average of the last ${Math.min(5, m.count)}` : "no band yet"}
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Tooltip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
      {children}
    </span>
  );
}

function Unavailable() {
  return <p className="text-sm text-muted-foreground">Your progress couldn&apos;t be loaded just now.</p>;
}

// ── Practice mix ────────────────────────────────────────────────────────────────────────────
const R = 42;
const CIRC = 2 * Math.PI * R;

export function MixCard({ stats, className }: { stats: DashboardStats | null; className?: string }) {
  const total = stats ? totalPractice(stats.modules) : 0;
  const shares = stats ? practiceShares(stats.modules) : null;
  // Arcs with a small gap between them (the surface shows through), starting at 12 o'clock.
  const gap = total > 0 && stats!.modules.filter((m) => m.count > 0).length > 1 ? 7 : 0;
  let offset = 0;
  const arcs =
    stats?.modules
      .filter((m) => m.count > 0)
      .map((m) => {
        const length = (m.count / total) * CIRC;
        const arc = { key: m.module, dash: Math.max(0.5, length - gap), offset };
        offset += length;
        return arc;
      }) ?? [];

  return (
    <section aria-labelledby="mix-heading" className={cn(cardClass, className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="mix-heading" className="text-lg font-medium">
          Practice mix
        </h2>
        <Pill>All time</Pill>
      </div>
      {!stats ? (
        <Unavailable />
      ) : (
        <>
          <div className="relative mx-auto size-44">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={R} fill="none" className="stroke-muted" strokeWidth="9" />
              {arcs.map((a) => (
                <circle
                  key={a.key}
                  cx="50"
                  cy="50"
                  r={R}
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap={gap ? "round" : "butt"}
                  className={MODULES[a.key].stroke}
                  strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
                  strokeDashoffset={-a.offset}
                />
              ))}
            </svg>
            <p className="absolute inset-0 grid place-content-center text-center">
              <span className="text-4xl leading-none font-light tabular-nums" data-testid="practice-total">
                {total}
              </span>
              <span className="text-xs text-muted-foreground">{total === 1 ? "practice" : "practices"}</span>
            </p>
          </div>
          <ul className="flex flex-col gap-3" aria-label="Practice by module">
            {stats.modules.map((m) => {
              const meta = MODULES[m.module];
              const share = shares![m.module];
              return (
                <li key={m.module} className="flex flex-col gap-1.5">
                  <p className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{meta.label}</span>
                    <span className="tabular-nums">
                      {m.count}
                      <span className="text-muted-foreground">/{total}</span>
                      <span className="sr-only"> ({share}%)</span>
                    </span>
                  </p>
                  <span className="block h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className={cn("block h-full rounded-full", meta.bg)} style={{ width: `${share}%`, ...hatch }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ── This week ───────────────────────────────────────────────────────────────────────────────
/** A smooth path through the points (Catmull-Rom → cubic Bézier), in a 0–100 × 0–100 box. */
function smoothPath(points: readonly [number, number][]): string {
  if (!points.length) return "";
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    // Never overshoot below the baseline or above the top.
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    d += ` C${c1[0]},${clamp(c1[1]!)} ${c2[0]},${clamp(c2[1]!)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function TrendCard({ stats, className }: { stats: DashboardStats | null; className?: string }) {
  const week = stats ? weekSummary(stats.days) : null;
  const max = week ? Math.max(1, ...week.thisWeek.map((d) => d.count), ...week.lastWeek.map((d) => d.count)) : 1;
  // x: the middle of each of 7 columns; y: 8 (top padding) … 92 (baseline).
  const x = (i: number) => ((i + 0.5) / 7) * 100;
  const y = (count: number) => 92 - (count / max) * 80;
  const points = (days: readonly DayStats[]) => days.map((d, i) => [x(i), y(d.count)] as [number, number]);
  const bandChange =
    week?.thisWeekBand != null && week.lastWeekBand != null ? Math.round((week.thisWeekBand - week.lastWeekBand) * 10) / 10 : 0;

  return (
    <section aria-labelledby="trend-heading" className={cn(cardClass, className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="trend-heading" className="text-lg font-medium">
          This week
        </h2>
        <Pill>Last 7 days</Pill>
      </div>
      {!stats || !week ? (
        <Unavailable />
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
            {/* Legend: both series, with their totals. */}
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legend">
              <li className="flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-background">
                <span className="size-1.5 rounded-full bg-background" aria-hidden /> This week: {plural(week.thisWeekCount, "practice", "practices")}
              </li>
              <li className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1">
                <span className="h-0 w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden /> Last week: {week.lastWeekCount}
              </li>
            </ul>
            <div className="relative h-36">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
                {[8, 50, 92].map((gy) => (
                  <line key={gy} x1="0" x2="100" y1={gy} y2={gy} className="stroke-border" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={smoothPath(points(week.lastWeek))} fill="none" className="stroke-muted-foreground" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                <path d={smoothPath(points(week.thisWeek))} fill="none" className="stroke-foreground" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              {/* One column per day: hover target, dot, tooltip and a crosshair. */}
              <ol className="absolute inset-0 grid grid-cols-7" aria-label="Practice per day this week">
                {week.thisWeek.map((d, i) => {
                  const before = week.lastWeek[i]!;
                  const today = i === 6;
                  return (
                    <li
                      key={d.date}
                      className="group relative"
                      aria-label={`${today ? "Today" : weekday(d.date, "long")}: ${plural(d.count, "practice", "practices")}${d.average_band !== null ? `, average band ${formatBand(d.average_band)}` : ""}`}
                    >
                      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground",
                          !today && "opacity-0 group-hover:opacity-100",
                        )}
                        style={{ top: `${y(d.count)}%` }}
                      />
                      <span aria-hidden className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity group-hover:opacity-100">
                        {dayMonth(d.date)}: {plural(d.count, "practice", "practices")}
                        {d.average_band !== null && ` · band ${formatBand(d.average_band)}`}
                        <span className="block text-background/70">
                          {weekday(before.date, "short")} last week: {before.count}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <ol className="grid grid-cols-7 gap-1 text-center text-[0.6875rem]" aria-hidden>
              {week.thisWeek.map((d, i) => (
                <li
                  key={d.date}
                  className={cn("rounded-full py-0.5", i === 6 ? "border border-foreground bg-card font-semibold" : "bg-card/70 text-muted-foreground")}
                >
                  {weekday(d.date, "short")}
                </li>
              ))}
            </ol>
          </div>
          <dl className="mt-auto grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">Practice this week</dt>
              <dd className="flex items-start gap-1.5">
                <span className="text-3xl leading-none font-light tabular-nums" data-testid="week-count">
                  {week.thisWeekCount}
                </span>
                {week.change !== null && <Change value={week.change} suffix="%" label="on last week" />}
              </dd>
            </div>
            <div className="flex flex-col gap-1 text-right">
              <dt className="text-xs text-muted-foreground">Average band</dt>
              <dd className="flex items-start justify-end gap-1.5">
                <span className="text-3xl leading-none font-light tabular-nums">
                  {week.thisWeekBand !== null ? formatBand(Math.round(week.thisWeekBand * 2) / 2) : "—"}
                </span>
                {bandChange !== 0 && <Change value={bandChange} suffix="" label="on last week" />}
              </dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
