import { Headphones, Mic, PenLine, TrendingUp } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";

const features = [
  {
    icon: Mic,
    title: "AI Speaking Examiner",
    body: "Parts 1–3 with a voice examiner. The cue card comes with a 1-minute prep timer.",
    highlight: true,
  },
  {
    icon: PenLine,
    title: "Writing Feedback",
    body: "Type your answer or upload a photo of handwritten work. Get criterion-wise band scores.",
  },
  {
    icon: Headphones,
    title: "Real Test Format",
    body: "Reading and Listening tests with every question type, scored automatically.",
  },
  {
    icon: TrendingUp,
    title: "Track Your Band",
    body: "A progress graph towards your target band and exam date.",
  },
];

/** White panel overlapping the bottom of the dark hero (design doc §3). One column is solid black. */
export function FeatureStrip() {
  return (
    <section aria-label="Features" className="container-page relative z-10 -mt-20 sm:-mt-24">
      <div className="grid gap-2 rounded-3xl border border-border bg-background p-2 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.35)] sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, body, highlight }) => (
          <div
            key={title}
            className={cn(
              "flex flex-col gap-3 rounded-2xl p-6",
              highlight && "dark bg-background text-foreground",
            )}
          >
            <Icon className="size-6" strokeWidth={1.5} aria-hidden />
            <h3 className="text-h3">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
