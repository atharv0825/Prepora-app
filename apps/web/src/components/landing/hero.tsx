import { WaitlistForm } from "../waitlist/waitlist-form";
import { HeroBackground } from "./hero-background";
import { HeroShowcase } from "./showcase/hero-showcase";

/** White hero, split 55/45 (design doc §2). Bottom padding leaves room for the feature strip. */
export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 sm:pb-28">
      <HeroBackground />
      <div className="container-page relative grid items-center gap-14 pt-20 sm:pt-24 lg:grid-cols-[55fr_45fr] lg:gap-8">
        {/* Vertically centred against the device (equal space above and below). */}
        <div className="flex animate-fade-up flex-col items-start gap-6">
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
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
          <HeroShowcase />
        </div>
      </div>
    </section>
  );
}
