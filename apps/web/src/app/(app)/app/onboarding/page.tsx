import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@prepora/shared/api/onboarding";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { routes } from "@/lib/routes";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Get started · Prepora", robots: { index: false } };

// M2-F2: the 3-step onboarding. /app sends new users here (see ../page.tsx); once test type and
// target band are saved, this page sends them home. The layout already checked the session.
export default async function OnboardingPage() {
  const account = await getAccount();
  const profile = account?.profile;
  if (profile && !needsOnboarding(profile)) redirect(routes.app);

  return (
    <div className="flex flex-1 flex-col justify-center pb-16">
      <OnboardingFlow
        initial={{
          test_type: profile?.test_type ?? undefined,
          target_band: profile?.target_band ?? undefined,
          exam_date: profile?.exam_date ?? undefined,
        }}
      />
    </div>
  );
}
