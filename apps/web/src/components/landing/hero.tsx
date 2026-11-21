import Link from "next/link";
import { BookOpenCheck, ListChecks, Timer } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { WaitlistForm } from "../waitlist/waitlist-form";
import { PhoneMockup } from "./phone-mockup";

// Product facts only. The design doc's social proof ("10,000+ learners", "+1.0 band",
// "20,000+ sessions") would be untrue before launch; swap real numbers in once we have them.
// From xl (1280px) the cards float around the phone, placed over its empty edges (above the
// screen, beside the waveform, below the record button) so they don't hide mockup text.
const stats = [
  { icon: BookOpenCheck, label: "IELTS modules", value: "4", position: "xl:left-0 xl:-top-6" },
  { icon: ListChecks, label: "Official criteria scored", value: "4 / 4", position: "xl:right-0 xl:top-[66%]" },
  { icon: Timer, label: "Part 2 prep timer", value: "1:00", position: "xl:left-0 xl:-bottom-8" },
];

/** Dark hero, split 55/45 (design doc §2). Bottom padding leaves room for the feature strip. */
export function Hero() {
  return (
    <section className="dark relative overflow-hidden pb-28 sm:pb-36">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0" />
      <div className="container-page relative grid items-center gap-14 pt-12 sm:pt-20 lg:grid-cols-[55fr_45fr] lg:gap-8">
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

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <PhoneMockup />
          <ul className="mt-8 grid gap-3 sm:grid-cols-3 xl:mt-0 xl:block">
            {stats.map(({ icon: Icon, label, value, position }, i) => (
              <li
                key={label}
                className={cn(
                  "glass flex animate-drift items-center gap-3 rounded-2xl px-4 py-3 xl:absolute xl:w-48",
                  position,
                )}
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
