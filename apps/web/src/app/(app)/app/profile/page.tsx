import type { Metadata } from "next";
import { STREAK_CALENDAR_DAYS } from "@prepora/shared/api/streak";
import { ProfileForm } from "@/components/account/profile-form";
import { ProfileStreak } from "@/components/account/profile-streak";
import { SubscriptionSettings } from "@/components/billing/subscription-settings";
import { fetchMySubscription, fetchPricing } from "@/lib/billing";
import { getAccount, getMyStreak } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Profile · Prepora", robots: { index: false } };

// Basic profile page (M1-F3): the name. More fields (country, time zone, exam details) come with
// onboarding. Practice streak with a 12-week calendar (M8.5-F2). Subscription: manage the plan
// (M9-F3: change plan, cancel, Paddle billing portal); routes.subscription links here.
export default async function ProfilePage() {
  const [account, streak] = await Promise.all([getAccount(), getMyStreak(STREAK_CALENDAR_DAYS)]);
  if (!account) return null; // the layout redirects first
  const missing = !account.profile;
  const [subscription, pricing] = await Promise.all([fetchMySubscription(), fetchPricing(account.profile?.country_code)]);

  return (
    <div className="flex w-full max-w-lg flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Profile</h1>
        <p className="text-muted-foreground">How your name appears in Prepora.</p>
      </div>

      {missing && (
        <p role="status" className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm">
          Your profile is still being set up, so you can&apos;t change your name yet. Please check back
          in a moment.
        </p>
      )}

      <ProfileForm defaultName={account.name === account.email ? "" : account.name} disabled={missing} />

      <div className="flex flex-col gap-1 border-t border-border pt-6">
        <p className="text-sm font-medium">Email</p>
        <p className="text-sm text-muted-foreground">{account.email}</p>
        <p className="text-xs text-muted-foreground">From your Google account. It can&apos;t be changed here.</p>
      </div>

      <SubscriptionSettings plan={account.profile?.plan ?? "free"} subscription={subscription} monthly={pricing?.subscriptions ?? []} />

      <ProfileStreak streak={streak} />
    </div>
  );
}
