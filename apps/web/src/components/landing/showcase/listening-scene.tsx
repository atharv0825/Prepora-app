import { Pause } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import { mmss, type SceneProps, typed } from "./shared";

const fields = [
  { label: "Surname", answer: "Kowalski", at: 800 },
  { label: "Phone", answer: "0794 612 330", at: 2300 },
  { label: "Day", answer: "Tuesday", at: 3800 },
  { label: "Deposit", answer: "£45", at: 5000 },
];

/** Phone · Listening Section 1: audio plays, form answers are written in as you listen. */
export function ListeningScene({ t }: SceneProps) {
  const progress = Math.min(1, t / 6800);
  return (
    <div className="flex h-full flex-col gap-4 px-5 pt-2 pb-5 text-brand-ink">
      <div className="flex items-center justify-between text-[11px] text-brand-teal">
        <span className="font-medium">Listening · Section 1</span>
        <span>Q 1–4</span>
      </div>
      <div className="rounded-2xl border border-brand-mist bg-white p-4">
        <p className="text-[11px] text-brand-teal">Gym membership form</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-primary text-brand-ink">
            <Pause className="size-4" strokeWidth={1.5} />
          </span>
          <div className="h-1 flex-1 rounded-full bg-brand-foam">
            <div className="h-full rounded-full bg-brand-primary" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="font-mono text-[10px] text-brand-teal">{mmss(progress * 214)}</span>
        </div>
      </div>
      <ol className="space-y-2.5">
        {fields.map((f, i) => {
          const value = typed(f.answer, t, f.at, 14);
          const done = value.length === f.answer.length;
          return (
            <li key={f.label} className="flex items-center gap-3 text-[11px]">
              <span className="w-4 text-brand-teal">{i + 1}</span>
              <span className="w-14 text-brand-teal">{f.label}</span>
              <span
                className={cn(
                  "flex h-7 flex-1 items-center rounded-lg border px-2 font-mono text-[11px]",
                  value ? "border-brand-sea/60" : "border-brand-mist",
                  done && "border-brand-sea/60",
                )}
              >
                {value}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-auto text-center text-[10px] text-brand-teal">Exam mode · recording plays once</p>
    </div>
  );
}
