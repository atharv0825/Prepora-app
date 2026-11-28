"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { type Offer, formatMoney } from "@prepora/shared/api/billing";
import type { PlanLimits } from "@prepora/shared/api/credits";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { BuyButton } from "./buy-button";

type Plan = { id: "free" | "gold" | "platinum"; name: string; limits: PlanLimits };
type Term = "month" | "pack";

/** The plan most students pick: labelled "Most popular", with the filled Buy button. */
const POPULAR = "gold";

/**
 * M9-F1/F2: the three plans side by side, monthly or as a 3-month exam pack, in the student's
 * currency, each paid plan with its Buy button. With a plan already running, the buttons lead to
 * Manage subscription (changing plan happens there).
 */
export function PlanPicker({
  plans,
  monthly,
  packs,
  current,
  hasSubscription,
  canBuy,
  email,
}: {
  plans: Plan[];
  monthly: Offer[];
  packs: Offer[];
  current: string;
  hasSubscription: boolean;
  canBuy: boolean;
  email: string | null;
}) {
  const [term, setTerm] = useState<Term>("month");
  const offers = term === "month" ? monthly : packs;

  return (
    <div className="flex flex-col gap-5">
      {(monthly.length > 0 || packs.length > 0) && (
        <div role="radiogroup" aria-label="How to pay" className="inline-flex self-center rounded-full border border-border bg-card p-1 text-sm">
          {(
            [
              ["month", "Monthly"],
              ["pack", "3-month exam pack"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={term === value}
              onClick={() => setTerm(value)}
              data-testid={`term-${value}`}
              className={cn(
                "rounded-full px-4 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                term === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ul className="grid gap-4 md:grid-cols-3" data-testid="plan-cards">
        {plans.map((p) => {
          const offer = offers.find((o) => o.plan_id === p.id);
          const isCurrent = p.id === current;
          return (
            <li
              key={p.id}
              data-testid={`plan-${p.id}`}
              className={cn(
                "flex flex-col gap-4 rounded-3xl border p-6",
                isCurrent ? "border-primary bg-secondary" : p.id === POPULAR ? "border-primary/60 bg-card shadow-sm" : "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h3">{p.name}</h2>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {p.id === POPULAR && (
                    <Badge variant="secondary" data-testid="popular">
                      Most popular
                    </Badge>
                  )}
                  {isCurrent && <Badge>Your plan</Badge>}
                </span>
              </div>

              <p className="min-h-14">
                {p.id === "free" ? (
                  <span className="text-h2">Free</span>
                ) : offer ? (
                  <>
                    <span className="text-h2 tabular-nums">{formatMoney(offer.amount_minor, offer.currency)}</span>
                    <span className="text-muted-foreground">{term === "month" ? " / month" : " for 3 months"}</span>
                    {term === "pack" && offer.credits && <span className="block text-sm text-muted-foreground">{offer.credits} AI credits included</span>}
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Not on sale in your country yet.</span>
                )}
              </p>

              <ul className="flex flex-1 flex-col gap-1.5 text-sm">
                <Feature>
                  <span className="font-medium tabular-nums">{p.limits.monthly_credits}</span> AI credits a month
                  {p.limits.welcome_credits > 0 && ` (+${p.limits.welcome_credits} welcome)`}
                </Feature>
                <Feature>Up to {p.limits.daily_credit_cap} credits a day</Feature>
                <Feature>
                  {p.limits.reading_tests} Reading and {p.limits.listening_tests} Listening tests a month
                </Feature>
                <Feature>{p.limits.mock_tests > 0 ? `${p.limits.mock_tests} full mock tests a month` : "No full mock tests"}</Feature>
                {p.limits.ocr && <Feature>Handwritten essays from a photo</Feature>}
                {p.limits.ai_gen && <Feature>AI-made topics and passages</Feature>}
                {p.limits.premium_voice && <Feature>Natural examiner voice</Feature>}
              </ul>

              {p.id !== "free" && offer && !isCurrent && (
                hasSubscription ? (
                  <Link href={routes.subscription} className={buttonVariants({ variant: "outline" })}>
                    Change plan in Settings
                  </Link>
                ) : canBuy ? (
                  <BuyButton
                    priceId={offer.id}
                    label={term === "month" ? `Get ${p.name}` : `Buy ${p.name} exam pack`}
                    email={email}
                    variant={p.id === POPULAR ? "default" : "outline"}
                    testId={`buy-${offer.id}`}
                  />
                ) : null
              )}
              {isCurrent && hasSubscription && (
                <Link href={routes.subscription} className={buttonVariants({ variant: "outline" })}>
                  Manage subscription
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
