"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@prepora/ui/components/button";
import "./cue-card.css";

/**
 * The Part 2 cue card as a real playing card: the topic, "You should say:" and its points, and
 * `children` (e.g. the "Start my 1 minute" note and button) all inside the card.
 *
 * It's revealed once per visit (each time this mounts): it appears face down, flips three times
 * in the air, falls with a small bounce, then turns over (cue-card.css). "Skip" jumps to the end.
 * With reduced motion it just fades in. While it's turning, the front is covered by the card's
 * back design, so nothing can be read or clicked before it lands.
 */
export function CueCardReveal({ title, points, children }: { title: string; points: string[]; children?: ReactNode }) {
  const [playing, setPlaying] = useState(true);

  return (
    <div className={playing ? "cc-stage cc-play" : "cc-stage"} data-testid="cue-card-stage" data-revealed={!playing}>
      {playing && (
        <Button variant="ghost" size="sm" className="cc-skip" onClick={() => setPlaying(false)} data-testid="cue-card-skip">
          Skip
        </Button>
      )}
      <div
        className="cc-card"
        onAnimationEnd={(e) => {
          // The card's own reveal (not a child's animation) has finished.
          if (e.target === e.currentTarget) setPlaying(false);
        }}
      >
        <section className="cc-face cc-front mint bg-background text-foreground" aria-label="Cue card" aria-hidden={playing || undefined} data-testid="cue-card">
          <span className="cc-corner cc-corner-top" aria-hidden>
            <b>2</b>
            <span>Cue card</span>
          </span>
          <span className="cc-corner cc-corner-bottom" aria-hidden>
            <b>2</b>
            <span>Cue card</span>
          </span>

          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Part 2 · Cue card</p>
          <h2 className="text-h3">{title}</h2>
          <p className="text-sm">You should say:</p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {children && <div className="mt-auto flex flex-col gap-3 pt-2">{children}</div>}

          {/* The back design over the front while it turns (hidden once it has landed). */}
          <span className="cc-cover" aria-hidden>
            <BackArt />
          </span>
        </section>

        <div className="cc-face cc-back" aria-hidden>
          <BackArt />
        </div>
      </div>
      <div className="cc-shadow" aria-hidden />
    </div>
  );
}

function BackArt() {
  return (
    <span className="cc-oval">
      <span>Prepora</span>
    </span>
  );
}
