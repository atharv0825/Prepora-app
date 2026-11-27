"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Lightbulb, Pause, Play } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import styles from "./motion.module.css";

// A rotating IELTS tip under the greeting. Changes every 8 seconds; pauses while hovered or
// focused, and has Pause / Next buttons (moving content needs a way to stop it). With reduced
// motion it doesn't rotate on its own.

const TIPS = [
  "Reading: skim the passage first, then scan for names, dates and numbers in the questions.",
  "True / False / Not Given: 'Not Given' means the passage doesn't say, not that it's unlikely.",
  "Listening: read the questions before each section starts and predict the type of answer.",
  "Writing Task 2: spend 5 minutes planning. A clear position earns more than extra words.",
  "Writing Task 1: describe the main trend first, then support it with two or three figures.",
  "Speaking Part 2: use your minute of notes for keywords, not full sentences.",
  "Speaking: it's fine to pause and rephrase. Fluency is about keeping going, not speed.",
  "Completion questions: check the word limit. 'NO MORE THAN TWO WORDS' means three is wrong.",
] as const;

/** `seed`: any whole number (e.g. today's date as 20261127) picks the first tip, the same on server and client. */
export function TipRotator({ seed = 0, className }: { seed?: number; className?: string }) {
  const [i, setI] = useState(() => Math.abs(Math.trunc(seed)) % TIPS.length);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (paused || hover || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % TIPS.length), 8000);
    return () => clearInterval(t);
  }, [paused, hover]);

  return (
    <div
      className={cn("flex max-w-2xl items-start gap-2 text-sm text-muted-foreground", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
      <p key={i} className={cn("min-w-0 flex-1", styles.tipIn)} data-testid="tip">
        <span className="font-medium text-foreground">Tip: </span>
        {TIPS[i]}
      </p>
      <span className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Resume tips" : "Pause tips"}
          className="grid size-6 place-items-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          {paused ? <Play className="size-3" aria-hidden /> : <Pause className="size-3" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => setI((n) => (n + 1) % TIPS.length)}
          aria-label="Next tip"
          className="grid size-6 place-items-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </span>
    </div>
  );
}
