import { Mic } from "lucide-react";

// Deterministic "waveform" so server and client render the same thing.
const bars = [6, 10, 16, 22, 14, 26, 32, 20, 28, 36, 24, 18, 30, 40, 26, 16, 22, 34, 28, 14, 20, 12, 8, 14];

/** Pure HTML/CSS phone showing the Speaking Part 2 cue card with a recording waveform. */
export function PhoneMockup() {
  return (
    <div
      aria-hidden
      className="relative mx-auto w-[260px] rounded-[2.75rem] border border-brand-line bg-brand-black p-2.5 shadow-[0_40px_120px_-40px_rgba(255,255,255,0.15)] sm:w-[280px]"
    >
      <div className="overflow-hidden rounded-[2.25rem] border border-brand-line bg-brand-surface">
        <div className="flex items-center justify-between px-6 pt-4 pb-2 text-[10px] text-brand-grey">
          <span>9:41</span>
          <span className="h-4 w-16 rounded-full bg-brand-black" />
          <span>100%</span>
        </div>
        <div className="flex flex-col gap-4 px-5 pt-2 pb-6">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-brand-grey">Speaking · Part 2</span>
            <span className="rounded-full border border-brand-line px-2 py-0.5 font-mono text-[10px] text-white">
              0:42
            </span>
          </div>
          <div className="rounded-2xl border border-brand-line bg-brand-black p-4">
            <p className="font-heading text-[15px] leading-snug text-white">
              Describe a place you visited that left a strong impression on you.
            </p>
            <p className="mt-3 text-[11px] text-brand-grey">You should say:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px] text-brand-grey">
              <li>where it is</li>
              <li>when you went there</li>
              <li>what you did there</li>
              <li>and explain why it impressed you</li>
            </ul>
          </div>
          <div className="flex h-12 items-center justify-center gap-[3px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-full bg-white"
                style={{ height: `${h}px`, opacity: 0.35 + (h / 40) * 0.65 }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] text-brand-grey">
              <span className="size-1.5 animate-pulse rounded-full bg-brand-green-light" />
              Recording…
            </span>
            <span className="grid size-11 place-items-center rounded-full bg-white text-brand-black">
              <Mic className="size-5" strokeWidth={1.5} />
            </span>
            <span className="font-mono text-[11px] text-brand-grey">1:12</span>
          </div>
        </div>
      </div>
    </div>
  );
}
