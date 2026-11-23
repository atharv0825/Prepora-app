import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsOnboarding } from "@prepora/shared/api/onboarding";
import { routes } from "@/lib/routes";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Home · Prepora", robots: { index: false } };

// Signed-in home. Placeholder until the dashboard arrives; the layout provides the header and
// the session check.
export default async function AppHome() {
  const account = await getAccount();
  // M2-F2: new users answer the 3 onboarding questions first. Only when the profile row exists:
  // without it (sign-up trigger M1-B2 not live yet) the answers couldn't be saved anyway.
  if (account?.profile && needsOnboarding(account.profile)) redirect(routes.onboarding);

  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-4 pb-16">
      <p className="text-eyebrow text-muted-foreground">Signed in</p>
      <h1 className="text-h1">
        Welcome, <span className="text-accent-serif">{account?.name}</span>
      </h1>
      <p className="max-w-md text-muted-foreground">
        Your practice dashboard is on its way. You&apos;re signed in as {account?.email}.
      </p>
    </div>
  );
}
