import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { appEnvironment } from "@prepora/shared/observability";
import { CreditsTestRunner } from "@/components/credits/credits-test-runner";

export const metadata: Metadata = { title: "Credits test · Prepora", robots: { index: false } };

// M3-I1: runs the dummy credits-test Edge Function (spends 4 credits through withCredits; the
// failing run is refunded) from the signed-in app, so the whole path can be checked in a browser:
// confirm → Edge Function → ledger → header chip. Not linked anywhere, and 404 in production
// (the function itself refuses there too). Until the first real AI feature (M6).
export default async function CreditsTestPage() {
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
  if (appEnvironment(host) === "production") notFound();

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Credits test</h1>
        <p className="text-muted-foreground">
          A pretend AI action that costs 4 credits, for checking credits end to end. The failing run refunds them
          automatically. Not available in production.
        </p>
      </div>
      <CreditsTestRunner />
    </div>
  );
}
