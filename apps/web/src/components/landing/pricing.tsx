import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { Reveal } from "./reveal";

// Plan §2.5 (credits, allowances) and §2.7 (India prices). Real pricing page with regional
// prices comes in M9.
const plans = [
  {
    name: "Free",
    price: "₹0",
    note: "forever",
    blurb: "Try every module.",
    features: [
      "8 AI credits a month + 10 welcome credits",
      "2 Reading and 2 Listening tests a month",
      "Band score with summary feedback",
    ],
    variant: "default" as const,
  },
  {
    name: "Gold",
    price: "₹299",
    note: "per month",
    blurb: "For steady weekly practice.",
    features: [
      "100 AI credits a month",
      "15 Reading and 15 Listening tests a month",
      "Detailed feedback and model answers",
      "Photo upload for handwritten writing",
      "2 full mock tests a month",
    ],
    variant: "default" as const,
  },
  {
    name: "Platinum",
    price: "₹599",
    note: "per month",
    blurb: "For the final push before your exam.",
    features: [
      "220 AI credits a month",
      "30 Reading and 30 Listening tests a month",
      "AI-generated extra practice",
      "Natural AI examiner voice",
      "4 full mock tests a month",
    ],
    variant: "inverted" as const,
    popular: true,
  },
];

/** Plan cards: Free bordered, Platinum solid black with "Most popular" (design doc §4). */
export function Pricing() {
  const anchor = routes.pricing.split("#")[1];
  return (
    <section id={anchor} className="scroll-mt-16 bg-muted py-20 sm:py-28">
      <div className="container-page">
        <Reveal className="max-w-2xl">
          <p className="text-eyebrow text-muted-foreground uppercase">Pricing</p>
          <h2 className="mt-3 text-h1">Start free. Upgrade when your exam gets close.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <Reveal key={p.name}>
              <Card variant={p.variant} className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    {p.name}
                    {p.popular && <Badge variant="outline" className="border-accent-purple">Most popular</Badge>}
                  </CardTitle>
                  <CardDescription>{p.blurb}</CardDescription>
                  <p className="mt-4">
                    <span className="font-heading text-5xl font-light tracking-tight">{p.price}</span>{" "}
                    <span className="text-sm text-muted-foreground">{p.note}</span>
                  </p>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6">
                  <ul className="flex flex-col gap-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="#waitlist"
                    className={cn(
                      buttonVariants({ variant: p.popular ? "default" : "outline" }),
                      "mt-auto w-full",
                    )}
                  >
                    Join the waitlist
                  </Link>
                </CardContent>
              </Card>
            </Reveal>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Prices shown for India. Other countries get local prices at launch. AI scoring uses
          credits; unused monthly credits don&apos;t roll over.
        </p>
      </div>
    </section>
  );
}
