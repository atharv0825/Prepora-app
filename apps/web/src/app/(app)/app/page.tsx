import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@prepora/shared/api/onboarding";
import { CreditsCard, GoalCard, ModuleGrid } from "@/components/dashboard/dashboard-cards";
import {
  dashboardModules,
  examCountdown,
  firstName,
  greeting,
  hourIn,
  planLabel,
  recommendedModule,
  testTypeLabel,
} from "@/lib/dashboard";
import { formatBand, localDate, validTimeZone } from "@/lib/onboarding";
import { routes } from "@/lib/routes";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Home · Prepora", robots: { index: false } };

// Signed-in home dashboard (M2-F3): greeting, goal card (target band + exam countdown), credits
// placeholder (until M3) and the four module tiles ("coming soon" until M4–M7). The layout
// provides the header and the session check.
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

  return (
    <div className="flex flex-col gap-8 pb-16">
      <h1 className="text-h1">
        {greeting(hourIn(timeZone))}, <span className="text-accent-serif">{firstName(account.name)}</span>
      </h1>

      <div className="grid gap-4 md:grid-cols-2">
        <GoalCard
          targetBand={profile?.target_band != null ? formatBand(profile.target_band) : null}
          testType={testTypeLabel(profile?.test_type)}
          countdown={examCountdown(profile?.exam_date, today)}
        />
        <CreditsCard plan={planLabel(profile?.plan)} />
      </div>

      <ModuleGrid modules={dashboardModules} recommended={recommendedModule(dashboardModules)} />
    </div>
  );
}
