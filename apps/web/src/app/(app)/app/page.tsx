import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { estimatedBand, totalPractice } from "@prepora/shared/api/dashboard";
import { needsOnboarding } from "@prepora/shared/api/onboarding";
import { ModuleGrid } from "@/components/dashboard/dashboard-cards";
import { LiveStatus } from "@/components/dashboard/live-status";
import motion from "@/components/dashboard/motion.module.css";
import { TodaysPlanCard } from "@/components/dashboard/plan-card";
import { TipRotator } from "@/components/dashboard/tip-rotator";
import { ChartsTeaser } from "@/components/dashboard/charts-teaser";
import { BandCard, GoalCard, MixCard, StreakCard, TrendCard } from "@/components/dashboard/overview";
import {
  dashboardModules,
  examCountdown,
  firstName,
  greeting,
  hourIn,
  recommendedModule,
  testTypeLabel,
} from "@/lib/dashboard";
import { formatBand, localDate, validTimeZone } from "@/lib/onboarding";
import { routes } from "@/lib/routes";
import { getAccount, getMyDashboard, getMyStreak, getMyStudyPlan } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Home · Prepora", robots: { index: false } };

// Signed-in home dashboard (M2-F3, redesigned in M8.6): greeting and a "Start practising" button,
// then on a soft panel two stat cards (goal + exam countdown, practice streak; the credit
// balance is the header chip) and three chart cards (band by module, practice mix, this week), then the four module tiles. The
// layout provides the header and the session check.
export default async function AppHome() {
  const account = await getAccount();
  if (!account) redirect(routes.login);
  const { profile } = account;
  // M2-F2: new users answer the 3 onboarding questions first. Only when the profile row exists:
  // without it (sign-up trigger M1-B2 not live yet) the answers couldn't be saved anyway.
  if (profile && needsOnboarding(profile)) redirect(routes.onboarding);

  // Dates and the greeting follow the student's time zone (saved in onboarding); UTC otherwise.
  const timeZone = validTimeZone(profile?.timezone);
  const today = localDate(timeZone);
  // Credits are shared with the layout's header chip (cached per request).
  const [streak, stats, plan] = await Promise.all([getMyStreak(), getMyDashboard(), getMyStudyPlan()]);
  // Recommended next: the module practised least (exam order on a tie).
  const recommended = recommendedModule(dashboardModules, stats ? Object.fromEntries(stats.modules.map((m) => [m.module, m.count])) : undefined);
  const start = dashboardModules.find((m) => m.key === recommended);

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-eyebrow text-muted-foreground">Your IELTS overview</span>
            <LiveStatus />
          </p>
          <h1 className="text-h1">
            {greeting(hourIn(timeZone))}, <span className="text-accent-serif">{firstName(account.name)}</span>
          </h1>
          {/* A different tip to start with each day. */}
          <TipRotator seed={Number(today.replace(/-/g, ""))} />
        </div>
        {start?.href && (
          <Link
            href={start.href}
            className="group inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_10px_20px_-10px_rgb(8_34_43/0.6)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0"
          >
            Start practising <ArrowRight className={`size-4 ${motion.nudge}`} aria-hidden />
          </Link>
        )}
      </div>

      {/* Phones: one column. Tablets: 2 columns, the trend full width. Wide: goal + streak, then
          the three charts (a 6-column grid so both rows fill evenly). */}
      <div className={`grid gap-3 rounded-[2rem] bg-muted p-3 sm:gap-4 sm:p-4 md:grid-cols-2 xl:grid-cols-6 ${motion.aurora}`}>
        <GoalCard
          index={0}
          className="xl:col-span-3"
          targetBand={profile?.target_band != null ? formatBand(profile.target_band) : null}
          testType={testTypeLabel(profile?.test_type)}
          countdown={examCountdown(profile?.exam_date, today)}
          estimate={stats ? (estimatedBand(stats.modules)?.band ?? null) : null}
        />
        <StreakCard index={1} streak={streak} className="xl:col-span-3" />
        {/* M8.7-F3: today's plan, or an invitation to follow one. */}
        <TodaysPlanCard plan={plan} className={`md:col-span-2 xl:col-span-6 ${motion.rise}`} style={{ "--i": 2 } as React.CSSProperties} />
        {/* First visit (nothing scored yet): a blurred sample with an invitation instead of three
            empty charts. The real cards take over after the first practice. */}
        {stats && totalPractice(stats.modules) === 0 ? (
          <ChartsTeaser today={today} href={start?.href ?? null} className="md:col-span-2 xl:col-span-6" />
        ) : (
          <>
            <BandCard index={2} stats={stats} className="xl:col-span-2" />
            <MixCard index={3} stats={stats} className="xl:col-span-2" />
            <TrendCard index={4} stats={stats} className="md:col-span-2 xl:col-span-2" />
          </>
        )}
      </div>

      <ModuleGrid modules={dashboardModules} recommended={recommended} stats={stats?.modules ?? null} />
    </div>
  );
}
