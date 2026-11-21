import Link from "next/link";
import { BookOpenCheck, ListChecks, Timer } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { WaitlistForm } from "../waitlist/waitlist-form";
import { HeroBackground } from "./hero-background";
import { HeroShowcase } from "./showcase/hero-showcase";

// Product facts only. The design doc's social proof ("10,000+ learners", "+1.0 band",
// "20,000+ sessions") would be untrue before launch; swap real numbers in once we have them.
// Shown as a row under the device showcase: the laptop is too wide for floating cards.
const stats = [
  { icon: BookOpenCheck, label: "IELTS modules", value: "4" },
  { icon: ListChecks, label: "Official criteria", value: "4 / 4" },
  { icon: Timer, label: "Part 2 prep", value: "1:00" },
];

/** Dark hero, split 55/45 (design doc §2). Bottom padding leaves room for the feature strip. */
export function Hero() {
  return (
    <section className="dark relative overflow-hidden pb-28 sm:pb-36">
      <HeroBackground />
      <div className="container-page relative grid items-center gap-14 pt-28 sm:pt-36 lg:grid-cols-[55fr_45fr] lg:gap-8">
        <div className="flex animate-fade-up flex-col items-start gap-6">
          <Badge variant="outline" className="text-eyebrow">
            <span className="size-1.5 rounded-full bg-accent-green" aria-hidden />
            Your AI IELTS Coach
          </Badge>
          <h1 className="text-display">
            Practise smarter.
            <br />
            Score higher.
            <br />
            Reach <span className="text-accent-serif">Band 8+</span>.
          </h1>
          <p className="max-w-lg text-lead text-muted-foreground">
            Speaking, Writing, Reading and Listening, with instant AI band scores and feedback on
            all 4 official criteria.
          </p>
          <WaitlistForm location="hero" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <Link
              href={routes.howItWorks}
              className={cn(buttonVariants({ variant: "link" }), "text-muted-foreground hover:text-foreground")}
            >
              See how it works
            </Link>
            <span className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-green" aria-hidden />
              Free beta opening in India, Nepal, Bangladesh and Sri Lanka
            </span>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-xl flex-col gap-6 lg:max-w-none">
          <HeroShowcase />
          <ul className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map(({ icon: Icon, label, value }, i) => (
              <li
                key={label}
                className="glass flex animate-drift flex-col gap-1 rounded-2xl px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-4"
                style={{ animationDelay: `${i * 1.1}s` }}
              >
                <Icon className="size-5 shrink-0 text-brand-grey" strokeWidth={1.5} aria-hidden />
                <div>
                  <p className="text-xs text-brand-grey">{label}</p>
                  <p className="font-heading text-xl font-semibold tracking-tight">{value}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
