import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/account/account-menu";
import { UserAnalytics } from "@/components/account/user-analytics";
import { Logo } from "@/components/layout/logo";
import { routes } from "@/lib/routes";
import { getAccount } from "@/lib/supabase/session";

// Signed-in shell (M1-F3): logo + account menu. src/middleware.ts already guards /app/*; this
// check is the second line of defence and loads the account for the menu.
// UserAnalytics identifies the user in PostHog and Sentry (M1-F4).
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const account = await getAccount();
  if (!account) redirect(routes.login);

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <UserAnalytics
        userId={account.user.id}
        person={{
          plan: account.profile?.plan ?? "free",
          country_code: account.profile?.country_code ?? undefined,
          // Onboarding answers (M2-F2), for segmenting by test type / goal.
          test_type: account.profile?.test_type ?? undefined,
          target_band: account.profile?.target_band ?? undefined,
          exam_date: account.profile?.exam_date ?? undefined,
        }}
      />
      <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo />
          <AccountMenu name={account.name} email={account.email} />
        </div>
      </header>
      <main id="main" className="container-page flex flex-1 flex-col py-10 sm:py-14">
        {children}
      </main>
    </div>
  );
}
