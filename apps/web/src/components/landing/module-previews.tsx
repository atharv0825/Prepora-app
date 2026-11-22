"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import { mmss } from "./showcase/shared";

// Live mini previews for the module cards (design doc §4), in brand-rust #8C3F3F.
// Literal colour for inline styles: Tailwind only emits theme variables that some class uses.
const RUST = "#8c3f3f";
const tint = (pct: number) => `color-mix(in oklab, ${RUST} ${pct}%, transparent)`;

const LOOP_MS = 8000;
const TICK = 100;

/**
 * Elapsed ms in an 8 s loop. Ticks only while the card is on screen and the tab is visible.
 * Reduced motion: fixed at a mid-loop "finished-looking" moment, no ticking.
 */
function useLoop() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setT(LOOP_MS * 0.7));
      return () => cancelAnimationFrame(id);
    }
    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
    });
    if (ref.current) io.observe(ref.current);
    const id = window.setInterval(() => {
      if (visible && !document.hidden) setT((p) => (p + TICK) % LOOP_MS);
    }, TICK);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, []);

  return { ref, t };
}

const wave = [8, 14, 22, 16, 28, 34, 20, 30, 38, 26, 18, 32, 24, 14, 22, 30, 18, 10, 16, 24, 12, 8];

/** Recording timer counts up, waveform bars move, the dot pulses. */
export function SpeakingPreview() {
  const { ref, t } = useLoop();
  return (
    <div ref={ref} className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse rounded-full bg-brand-rust" aria-hidden />
          Part 2 · Recording
        </span>
        <span className="font-mono">{mmss(60 + t / 1000)}</span>
      </div>
      <div className="flex h-14 items-center gap-[3px]">
        {wave.map((h, i) => (
          <span
            key={i}
            className="w-1 origin-center rounded-full bg-brand-rust"
            style={{
              height: `${h}px`,
              animation: `wave-bar ${0.7 + (i % 5) * 0.15}s ease-in-out ${(i % 7) * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const lines = [100, 92, 96, 70];

/** Essay lines fill in one after another with a caret, word count climbs, timer counts down. */
export function WritingPreview() {
  const { ref, t } = useLoop();
  const typing = Math.min(1, t / (LOOP_MS * 0.75)); // 0 → 1 over 6 s, then holds
  return (
    <div ref={ref} className="flex h-full flex-col gap-2.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Task 2 · Essay</span>
        <span className="font-mono">{mmss(32 * 60 + 10 - t / 1000)} left</span>
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
        {lines.map((w, i) => {
          const fill = Math.max(0, Math.min(1, typing * lines.length - i));
          const active = fill > 0 && fill < 1;
          return (
            <div key={i} className="relative h-2 rounded-full bg-foreground/10" style={{ width: `${w}%` }}>
              <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: tint(55) }} />
              {active && (
                <span
                  className="absolute -top-0.5 h-3 w-px bg-brand-rust [animation:caret-blink_1s_steps(1)_infinite]"
                  style={{ left: `${fill * 100}%` }}
                />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-right font-mono text-xs text-muted-foreground">
        {Math.round(190 + typing * 78)} / 250 words
      </p>
    </div>
  );
}

const passage = [100, 94, 98, 88, 96, 60];
const options = ["True", "False", "Not Given"];

/** A highlight sweeps down the passage, then an answer gets picked. */
export function ReadingPreview() {
  const { ref, t } = useLoop();
  const read = Math.min(passage.length, Math.floor(t / 800)); // one line every 0.8 s
  const picked = t > 5200 ? 2 : -1; // "Not Given" once the passage is read
  return (
    <div ref={ref} className="grid h-full grid-cols-2 gap-3">
      <div className="space-y-2 rounded-xl border border-border bg-background p-3">
        {passage.map((w, i) => (
          <div
            key={i}
            className="h-1.5 rounded-full transition-colors duration-300"
            style={{ width: `${w}%`, background: i < read ? tint(50) : "color-mix(in oklab, currentColor 15%, transparent)" }}
          />
        ))}
      </div>
      <div className="space-y-2 text-[11px]">
        <p className="font-medium">14. The author suggests…</p>
        {options.map((o, i) => (
          <div key={o} className="flex items-center gap-2 text-muted-foreground">
            <span
              className={cn(
                "size-3 rounded-full border border-foreground/40 transition-colors duration-300",
                i === picked && "border-brand-rust bg-brand-rust",
              )}
            />
            <span className={cn(i === picked && "font-medium text-brand-rust")}>{o}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Audio plays: progress fills, time ticks; it pauses briefly at the end of the loop. */
export function ListeningPreview() {
  const { ref, t } = useLoop();
  const playing = t < LOOP_MS - 1200;
  const progress = 0.25 + 0.5 * Math.min(1, t / (LOOP_MS - 1200));
  return (
    <div ref={ref} className="flex h-full flex-col justify-between gap-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Section 2 of 4</span>
        <span>Questions 11–20</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-rust text-white">
          {playing ? <Pause className="size-4" strokeWidth={1.5} /> : <Play className="size-4" strokeWidth={1.5} />}
        </span>
        <div className="h-1.5 flex-1 rounded-full bg-foreground/15">
          <div className="h-full rounded-full bg-brand-rust" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="font-mono text-xs text-muted-foreground">{mmss(progress * 410)}</span>
      </div>
    </div>
  );
}
