"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@prepora/ui/components/button";
import "./cue-card.css";

/**
 * The Part 2 cue card as a real playing card: the topic, "You should say:" and its points.
 *
 * It's revealed once per visit (each time this mounts): it appears face down, flips three times
 * in the air, falls with a small bounce, then turns over (cue-card.css). "Skip" jumps to the end.
 * With reduced motion it just fades in. While it's turning, the front is covered by the card's
 * back design, so nothing can be read or clicked before it lands.
 */
export function CueCardReveal({ title, points, onRevealed }: { title: string; points: string[]; onRevealed?: () => void }) {
  const [playing, setPlaying] = useState(true);
  const revealed = useRef(onRevealed);
  useEffect(() => {
    revealed.current = onRevealed;
  }, [onRevealed]);
  useEffect(() => {
    if (!playing) revealed.current?.();
  }, [playing]);

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
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem]">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>

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

/**
 * The card and what goes with it (the timer, notes, recording…). Until `split`, the card is
 * centred on its own; then (768px and wider) it slides to the left column and `children` fade in
 * on the right. The slide animates from where the card was (a measured FLIP, Web Animations).
 */
export function CueCardLayout({ split, card, children }: { split: boolean; card: ReactNode; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<DOMRect | null>(null);
  // Where the card sits while centred (measured after every render until it moves).
  // (The card itself: its column is full width until the split.)
  const cardRect = () => box.current?.querySelector(".cc-card")?.getBoundingClientRect() ?? null;
  useLayoutEffect(() => {
    if (!split) before.current = cardRect();
  });
  useLayoutEffect(() => {
    const el = box.current;
    const from = before.current;
    if (!split || !el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = cardRect();
    if (!to) return;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 650, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
  }, [split]);

  return (
    <div className={split ? "cc-layout cc-split" : "cc-layout"} data-testid="cue-card-layout">
      <div ref={box} className="cc-left">
        {card}
      </div>
      {split && <div className="cc-right">{children}</div>}
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
