import { Mic } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import { mmss, type SceneProps } from "./shared";

const bars = [10, 16, 24, 18, 30, 36, 22, 32, 40, 28, 20, 34, 26, 16, 24, 32, 20, 12, 18, 26, 14, 10];

/** Phone · Speaking Part 2: recording timer runs, waveform moves, then the band appears. */
export function SpeakingScene({ t }: SceneProps) {
  const recording = t < 5200;
  const scored = t >= 5600;
  return (
    <div className="flex h-full flex-col gap-3.5 px-5 pt-2 pb-5 text-white">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-brand-grey">Speaking · Part 2</span>
        <span className="rounded-full border border-brand-line px-2 py-0.5 font-mono text-[10px]">
          {recording ? mmss(62 + t / 1000) : "1:07"}
        </span>
      </div>
      <div className="rounded-2xl border border-brand-line bg-brand-black p-4">
        <p className="font-heading text-[15px] leading-snug">
          Describe a place you visited that left a strong impression on you.
        </p>
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-[11px] text-brand-grey">
          <li>where it is</li>
          <li>when you went there</li>
          <li>and explain why it impressed you</li>
        </ul>
      </div>
      <div className="flex h-12 items-center justify-center gap-[3px]">
        {bars.map((h, i) => (
          <span
            key={i}
            className="w-[3px] origin-center rounded-full bg-white"
            style={{
              height: `${h}px`,
              opacity: 0.4 + (h / 40) * 0.6,
              animation: recording ? `wave-bar ${0.7 + (i % 5) * 0.15}s ease-in-out ${(i % 7) * 0.08}s infinite` : "none",
              transform: recording ? undefined : "scaleY(0.25)",
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-brand-grey">
          <span className={cn("size-1.5 rounded-full", recording ? "animate-pulse bg-brand-green-light" : "bg-brand-grey")} />
          {recording ? "Recording…" : scored ? "Scored" : "Analysing…"}
        </span>
        <span className="relative grid size-11 place-items-center rounded-full bg-white text-brand-black">
          {recording && <span className="absolute inset-0 animate-ping rounded-full bg-white/30" />}
          <Mic className="relative size-5" strokeWidth={1.5} />
        </span>
        <span className="font-mono text-[11px] text-brand-grey">2:00</span>
      </div>
      <div
        className={cn(
          "mt-auto rounded-2xl border border-brand-line bg-brand-black p-3 transition-all duration-500",
          scored ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-brand-grey">Band</span>
          <span className="font-heading text-2xl font-light">7.0</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1 text-center font-mono text-[9px] text-brand-grey">
          {[["FC", "7.0"], ["LR", "7.0"], ["GRA", "6.5"], ["P", "7.0"]].map(([k, v]) => (
            <span key={k} className="rounded-md bg-brand-surface py-1">
              {k} <span className="text-white">{v}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
