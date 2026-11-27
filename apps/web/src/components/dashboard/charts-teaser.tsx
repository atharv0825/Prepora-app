import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DashboardStats } from "@prepora/shared/api/dashboard";
import { daysBefore } from "@prepora/shared/api/streak";
import { cn } from "@prepora/ui/lib/utils";
import { BandCard, MixCard, TrendCard } from "./overview";

// First visit (no scored practice yet): instead of three empty chart cards, show them filled with
// SAMPLE data, blurred, with a message on top inviting the first practice. It's only a teaser:
// the sample is hidden from screen readers and can't be focused or clicked (inert), and it goes
// away for good once the student has any practice, when the real cards take its place.

/** Believable sample numbers for the blurred preview (never shown unblurred). */
export function sampleStats(today: string): DashboardStats {
  const counts = [1, 0, 2, 1, 0, 1, 2, 1, 2, 0, 3, 1, 2, 2];
  const bands = [6, null, 6.5, 6, null, 6.5, 6.5, 6.5, 7, null, 6.5, 7, 7, 7];
  return {
    timezone: "UTC",
    today,
    modules: [
      { module: "reading", count: 8, latest_band: 7, recent_band: 6.6 },
      { module: "listening", count: 6, latest_band: 7, recent_band: 7 },
      { module: "writing", count: 3, latest_band: 6, recent_band: 6 },
      { module: "speaking", count: 4, latest_band: 6.5, recent_band: 6.4 },
    ],
    days: counts.map((count, i) => ({ date: daysBefore(today, 13 - i), count, average_band: bands[i] ?? null })),
  };
}

export function ChartsTeaser({ today, href, className }: { today: string; href: string | null; className?: string }) {
  const sample = sampleStats(today);
  return (
    <section aria-labelledby="teaser-heading" className={cn("relative", className)} data-testid="charts-teaser">
      {/* The sample, blurred and out of reach. */}
      <div aria-hidden inert className="pointer-events-none grid gap-3 blur-[6px] select-none sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BandCard index={2} stats={sample} />
        {/* Phones: one blurred card is enough behind the message. */}
        <MixCard index={3} stats={sample} className="max-md:hidden" />
        <TrendCard index={4} stats={sample} className="max-md:hidden md:col-span-2 xl:col-span-1" />
      </div>

      {/* The message on top. */}
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-3xl bg-card/90 p-6 text-center shadow-[0_20px_50px_-20px_rgb(8_34_43/0.45)] ring-1 ring-border backdrop-blur-sm">
          <span aria-hidden className="grid size-12 place-items-center rounded-full bg-accent text-accent-green ring-4 ring-primary/20">
            <Sparkles className="size-5" />
          </span>
          <h2 id="teaser-heading" className="text-lg font-medium">
            Your progress shows up here
          </h2>
          <p className="text-sm text-muted-foreground">
            Finish your first Reading, Listening, Writing or Speaking practice. Your band by module, practice mix and weekly trend
            appear here as soon as it&apos;s scored.
          </p>
          {href && (
            <Link
              href={href}
              className="group mt-1 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-[#62d7a5] to-brand-primary px-5 py-2.5 text-sm font-medium text-brand-ink ring-1 ring-black/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_10px_20px_-10px_rgb(15_164_103/0.8)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:hover:translate-y-0"
            >
              Start your first practice <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          )}
          <p className="text-xs text-muted-foreground">The charts behind are a sample.</p>
        </div>
      </div>
    </section>
  );
}
