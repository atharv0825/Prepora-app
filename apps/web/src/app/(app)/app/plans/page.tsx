import type { Metadata } from "next";
import Link from "next/link";
import { PlanLimits } from "@prepora/shared/api/credits";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Plans · Prepora", robots: { index: false } };

// Placeholder (M3-F3): where the "See plans" and "Top up credits" buttons in the credit dialogs
// lead until billing ships. M9-F1 replaces it with the pricing page and checkout, M9-F3 with
// top-ups. The plan numbers come from the plans table, so they match what the credits engine uses.
export default async function PlansPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const current = account.profile?.plan ?? "free";
  const supabase = await createClient();
  const { data } = await supabase.from("plans").select("id, name, limits").eq("is_active", true).order("id");
  const plans = (data ?? []).flatMap((p) => {
    const limits = PlanLimits.safeParse(p.limits);
    return limits.success ? [{ id: p.id, name: p.name, limits: limits.data }] : [];
  });

  return (
    <div className="flex w-full max-w-3xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Plans &amp; top-ups</h1>
        <p className="text-muted-foreground">
          Upgrading and buying extra credits are coming soon. Until then, here&apos;s what each plan includes.
        </p>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <li key={p.id} className={cn("flex flex-col gap-4 rounded-3xl border p-6", p.id === current ? "border-primary bg-secondary" : "border-border bg-card")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-h3">{p.name}</h2>
              {p.id === current && <Badge>Your plan</Badge>}
            </div>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li>
                <span className="font-medium tabular-nums">{p.limits.monthly_credits}</span> AI credits a month
                {p.limits.welcome_credits > 0 && ` (+${p.limits.welcome_credits} welcome)`}
              </li>
              <li>Up to {p.limits.daily_credit_cap} credits a day</li>
              <li>{p.limits.reading_tests} Reading and {p.limits.listening_tests} Listening tests a month</li>
              <li>{p.limits.mock_tests > 0 ? `${p.limits.mock_tests} full mock tests a month` : "No full mock tests"}</li>
            </ul>
          </li>
        ))}
      </ul>

      <section id="top-up" aria-labelledby="top-up-heading" className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-6">
        <h2 id="top-up-heading" className="text-h3">
          Top-up credits
        </h2>
        <p className="text-muted-foreground">
          Credit packs for any plan, valid for 12 months, are coming soon.
        </p>
      </section>

      <Link href={routes.credits} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
        Back to credits &amp; usage
      </Link>
    </div>
  );
}
