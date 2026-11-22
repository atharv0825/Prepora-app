import { cn } from "@prepora/ui/lib/utils";
import { mmss, type SceneProps, typed } from "./shared";

const essay =
  "Some people believe that university education should be free for everyone. In my opinion, governments should fund higher education because it benefits the whole of society, not only the individual student. Firstly, a better-educated workforce";

const criteria = [
  { k: "Task Response", v: 6.5 },
  { k: "Coherence", v: 7.0 },
  { k: "Lexical", v: 6.5 },
  { k: "Grammar", v: 6.0 },
];

/** Laptop · Writing Task 2: the essay types itself, word count climbs, then the score panel. */
export function WritingScene({ t }: SceneProps) {
  const text = typed(essay, t, 300, 48);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const scored = t >= 5400;
  return (
    <div className="flex h-full flex-col text-brand-ink">
      <div className="flex items-center justify-between border-b border-brand-mist px-4 py-2 text-[10px] text-brand-teal">
        <span className="font-medium text-brand-ink">Writing · Task 2</span>
        <span className="font-mono">{mmss(39 * 60 + 12 - t / 1000)} left</span>
      </div>
      <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
        <div className="flex min-w-0 flex-col gap-2 p-4">
          <p className="text-[10px] leading-relaxed text-brand-teal">
            Some people think university should be free. To what extent do you agree?
          </p>
          <p className="text-xs leading-relaxed">
            {text}
            {!scored && <span className="ml-px inline-block h-3 w-px translate-y-0.5 bg-brand-ink [animation:caret-blink_1s_steps(1)_infinite]" />}
          </p>
          <p className="mt-auto font-mono text-[10px] text-brand-teal">{words + 214} / 250 words</p>
        </div>
        <aside
          className={cn(
            "w-0 overflow-hidden border-l border-brand-mist bg-white transition-all duration-500",
            scored && "w-40",
          )}
        >
          <div className="w-40 p-3">
            <p className="text-[10px] text-brand-teal">Overall band</p>
            <p className="font-heading text-3xl font-light">6.5</p>
            <ul className="mt-2 space-y-1.5">
              {criteria.map((c) => (
                <li key={c.k}>
                  <div className="flex justify-between text-[9px] text-brand-teal">
                    <span>{c.k}</span>
                    <span className="font-mono text-brand-ink">{c.v.toFixed(1)}</span>
                  </div>
                  <div className="mt-0.5 h-1 rounded-full bg-brand-foam">
                    <div
                      className="h-full rounded-full bg-brand-primary transition-[width] duration-700"
                      style={{ width: scored ? `${(c.v / 9) * 100}%` : "0%" }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
