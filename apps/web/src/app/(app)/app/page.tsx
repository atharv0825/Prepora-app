import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { estimatedBand } from "@prepora/shared/api/dashboard";
import { needsOnboarding } from "@prepora/shared/api/onboarding";
import { ModuleGrid } from "@/components/dashboard/dashboard-cards";
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
import { getAccount, getMyDashboard, getMyStreak } from "@/lib/supabase/session";

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
  const [streak, stats] = await Promise.all([getMyStreak(), getMyDashboard()]);
  const recommended = recommendedModule(dashboardModules);
  const start = dashboardModules.find((m) => m.key === recommended);

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-eyebrow text-muted-foreground">Your IELTS overview</p>
          <h1 className="text-h1">
            {greeting(hourIn(timeZone))}, <span className="text-accent-serif">{firstName(account.name)}</span>
          </h1>
        </div>
        {start?.href && (
          <Link
            href={start.href}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Start practising <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      {/* Phones: one column. Tablets: 2 columns, the trend full width. Wide: goal + streak, then
          the three charts (a 6-column grid so both rows fill evenly). */}
      <div className="grid gap-3 rounded-[2rem] bg-muted p-3 sm:gap-4 sm:p-4 md:grid-cols-2 xl:grid-cols-6">
        <GoalCard
          className="xl:col-span-3"
          targetBand={profile?.target_band != null ? formatBand(profile.target_band) : null}
          testType={testTypeLabel(profile?.test_type)}
          countdown={examCountdown(profile?.exam_date, today)}
          estimate={stats ? (estimatedBand(stats.modules)?.band ?? null) : null}
        />
        <StreakCard streak={streak} className="xl:col-span-3" />
        <BandCard stats={stats} className="xl:col-span-2" />
        <MixCard stats={stats} className="xl:col-span-2" />
        <TrendCard stats={stats} className="md:col-span-2 xl:col-span-2" />
      </div>

      <ModuleGrid modules={dashboardModules} recommended={recommended} />
    </div>
  );
}
