import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/layout/logo";
import { routes } from "@/lib/routes";
import { getCurrentUser } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Home · Prepora", robots: { index: false } };

// Landing page after sign-in (M1-F1). Placeholder until the app shell and modules arrive:
// M1-F2 moves the signed-out redirect into proxy.ts for all of /app/*, M1-F3 adds the account menu.
export default async function AppHome() {
  const user = await getCurrentUser();
  if (!user) redirect(`${routes.login}?next=${encodeURIComponent(routes.app)}`);

  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    user.email;

  return (
    <div className="flex min-h-dvh flex-1 flex-col">
      <header className="container-page flex h-16 items-center">
        <Logo />
      </header>
      <main id="main" className="container-page flex flex-1 flex-col items-start justify-center gap-4 pb-24">
        <p className="text-eyebrow text-muted-foreground">Signed in</p>
        <h1 className="text-h1">
          Welcome, <span className="text-accent-serif">{name}</span>
        </h1>
        <p className="max-w-md text-muted-foreground">
          Your practice dashboard is on its way. You&apos;re signed in as {user.email}.
        </p>
      </main>
    </div>
  );
}
