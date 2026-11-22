"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@prepora/ui/lib/utils";
import { ListeningScene } from "./listening-scene";
import { ReadingScene } from "./reading-scene";
import { SCENE_MS } from "./shared";
import { SpeakingScene } from "./speaking-scene";
import { WritingScene } from "./writing-scene";

const scenes = [
  { id: "speaking", label: "Speaking", device: "phone", Scene: SpeakingScene },
  { id: "writing", label: "Writing", device: "laptop", Scene: WritingScene },
  { id: "reading", label: "Reading", device: "laptop", Scene: ReadingScene },
  { id: "listening", label: "Listening", device: "phone", Scene: ListeningScene },
] as const;

const TICK = 100;
// Laptop screen content is laid out at this fixed size, then scaled to fit (like a screenshot),
// so it looks identical on a 390px phone and a desktop.
const LAPTOP_W = 520;
const LAPTOP_H = 292;
const LAPTOP_MAX = 540; // frame width cap
const FRAME_CHROME = 22; // frame padding (2 × 10px) + borders
const STATUS_BAR = 28; // h-7

/**
 * Hero device showcase: live, self-playing demos of the four modules. Starts on the phone
 * (Speaking), the frame morphs into a laptop for Writing and Reading, back to the phone for
 * Listening, and loops. Decorative (aria-hidden); no tabs or stat cards under it.
 * Pauses on hover/focus, when scrolled out of view or the tab is hidden. With reduced motion it
 * doesn't auto-play and each scene shows its finished state.
 */
export function HeroShowcase() {
  // One state object: scene index and its elapsed time change together (no nested setState).
  const [{ index, t }, setPlay] = useState({ index: 0, t: 0 });
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const paused = useRef(false);
  const visible = useRef(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root.current;
    const io = new IntersectionObserver(([e]) => {
      visible.current = Boolean(e?.isIntersecting);
    });
    if (el) io.observe(el);

    const id = window.setInterval(() => {
      if (reduced) {
        // Show the finished state of the selected scene; never advance on its own.
        setPlay((p) => (p.t === SCENE_MS ? p : { ...p, t: SCENE_MS }));
        return;
      }
      if (paused.current || !visible.current || document.hidden) return;
      setPlay((p) =>
        p.t + TICK >= SCENE_MS
          ? { index: (p.index + 1) % scenes.length, t: 0 }
          : { index: p.index, t: p.t + TICK },
      );
    }, TICK);

    // Scale for the laptop screen, from the available width.
    const ro = new ResizeObserver(([entry]) => {
      const width = Math.min(entry?.contentRect.width ?? LAPTOP_MAX, LAPTOP_MAX);
      setScale(Math.min(1, (width - FRAME_CHROME) / LAPTOP_W));
    });
    if (stage.current) ro.observe(stage.current);

    return () => {
      window.clearInterval(id);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const current = scenes[index]!;
  const laptop = current.device === "laptop";

  return (
    <div
      ref={root}
      className="flex w-full flex-col items-center"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      {/* Fixed-height stage so the page doesn't jump while the device morphs. */}
      <div className="flex h-[560px] w-full items-center justify-center sm:h-[580px]">
        <div ref={stage} className="flex w-full flex-col items-center">
          <div
            aria-hidden
            className="relative overflow-hidden border border-brand-line bg-brand-black p-2.5 shadow-[0_40px_120px_-40px_rgba(8,34,43,0.45)] transition-[width,height,border-radius] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: laptop ? `min(100%, ${LAPTOP_MAX}px)` : "272px",
              height: laptop ? `${FRAME_CHROME + STATUS_BAR + LAPTOP_H * scale}px` : "540px",
              borderRadius: laptop ? "18px" : "44px",
            }}
          >
            <div
              className="relative h-full overflow-hidden border border-brand-line bg-brand-foam transition-[border-radius] duration-700"
              style={{ borderRadius: laptop ? "10px" : "34px" }}
            >
              {/* Phone status bar / laptop camera dot */}
              <div className="flex h-7 items-center justify-between px-6 text-[10px] text-brand-teal">
                <span className={cn("transition-opacity duration-300", laptop && "opacity-0")}>9:41</span>
                <span
                  className={cn(
                    "rounded-full bg-brand-black transition-all duration-700",
                    laptop ? "h-1.5 w-1.5" : "h-4 w-16",
                  )}
                />
                <span className={cn("transition-opacity duration-300", laptop && "opacity-0")}>100%</span>
              </div>
              {scenes.map(({ id, device, Scene }, i) => (
                <div
                  key={id}
                  className={cn(
                    "absolute inset-x-0 top-7 bottom-0 transition-opacity duration-500",
                    i === index ? "opacity-100" : "pointer-events-none opacity-0",
                  )}
                >
                  {/* Only the active scene runs its timeline; others rest at t=0. */}
                  {device === "laptop" ? (
                    <div
                      className="origin-top-left"
                      style={{ width: LAPTOP_W, height: LAPTOP_H, transform: `scale(${scale})` }}
                    >
                      <Scene t={i === index ? t : 0} />
                    </div>
                  ) : (
                    <Scene t={i === index ? t : 0} />
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Laptop base */}
          <div
            aria-hidden
            className={cn(
              "h-3 rounded-b-xl border border-t-0 border-brand-line bg-brand-surface transition-all duration-700",
              laptop ? "w-[min(100%,588px)] opacity-100" : "w-0 opacity-0",
            )}
          />
        </div>
      </div>

    </div>
  );
}
