import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney } from "@prepora/shared/api/billing";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { BuyButton } from "@/components/billing/buy-button";
import { PlanPicker } from "@/components/billing/plan-picker";
import { fetchMySubscription, fetchPlans, fetchPricing } from "@/lib/billing";
import { routes } from "@/lib/routes";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Plans · Prepora", robots: { index: false } };

// M9-F1…F3: plans and top-ups, priced for the student's country (get_prices: currency and
// provider), bought in the page (Razorpay in India, Paddle elsewhere). Every "See plans" /
// "Top up credits" button and paywall in the app (M3-F3) lands here (routes.upgrade, routes.topUp).
// Plan details come from the plans table, so they match what the credits engine uses.
export default async function PlansPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const current = account.profile?.plan ?? "free";
  const [plans, pricing, subscription] = await Promise.all([fetchPlans(), fetchPricing(account.profile?.country_code), fetchMySubscription()]);
  const canBuy = Boolean(pricing?.enabled);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-h1">Plans &amp; top-ups</h1>
          <p className="text-muted-foreground">
            {pricing?.provider === "razorpay"
              ? "Prices in rupees. Pay with UPI (AutoPay for monthly plans), cards or netbanking through Razorpay."
              : pricing?.provider === "paddle"
                ? "Paddle handles the payment: you see the price in your currency, with any tax, before you pay."
                : "Here's what each plan includes."}
          </p>
        </div>
        <Link href={routes.credits} className={cn(buttonVariants({ variant: "outline" }), "shrink-0 self-start")}>
          Back to credits &amp; usage
        </Link>
      </div>

      {!canBuy && (
        <p role="status" className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm" data-testid="not-on-sale">
          {!account.profile?.country_code
            ? "Add your country to see prices."
            : "Payments aren't open in your country yet."}
        </p>
      )}

      {subscription && (
        <p role="status" className="rounded-2xl border border-border bg-card px-4 py-3 text-sm" data-testid="current-subscription">
          You&apos;re on <strong>{subscription.plan_id === "gold" ? "Gold" : "Platinum"}</strong>
          {subscription.kind === "exam_pack" ? " (exam pack)" : ""} until{" "}
          {new Date(subscription.current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          {subscription.kind === "subscription" && !subscription.cancel_at_period_end ? ", then it renews." : "."}{" "}
          <Link href={routes.subscription} className="font-medium underline underline-offset-4">
            Manage subscription
          </Link>
        </p>
      )}

      <PlanPicker
        plans={plans}
        monthly={pricing?.subscriptions ?? []}
        packs={pricing?.exam_packs ?? []}
        current={current}
        hasSubscription={Boolean(subscription)}
        canBuy={canBuy}
        email={account.email}
      />

      <section id="top-up" aria-labelledby="top-up-heading" className="flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 id="top-up-heading" className="text-h3">
            Top-up credits
          </h2>
          <p className="text-sm text-muted-foreground">Extra AI credits on any plan, Free included. Valid for 12 months; used after your monthly credits run out.</p>
        </div>
        {pricing && pricing.topups.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="topups">
            {pricing.topups.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
                <span>
                  <span className="block font-medium tabular-nums">{t.credits} credits</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{formatMoney(t.amount_minor, t.currency)}</span>
                </span>
                {canBuy && <BuyButton priceId={t.id} label="Buy" email={account.email} variant="outline" testId={`buy-${t.id}`} />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Top-ups aren&apos;t on sale in your country yet.</p>
        )}
      </section>

    </div>
  );
}
