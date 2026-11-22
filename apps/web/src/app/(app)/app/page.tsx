import type { Metadata } from "next";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Home · Prepora", robots: { index: false } };

// Signed-in home. Placeholder until the dashboard arrives; the layout provides the header and
// the session check.
export default async function AppHome() {
  const account = await getAccount();

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
