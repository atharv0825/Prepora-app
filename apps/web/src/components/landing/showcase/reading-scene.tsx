import { Check } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import type { SceneProps } from "./shared";

const questions = [
  { q: "Bees can recognise human faces.", answer: "True", at: 1600 },
  { q: "The study took place in Australia.", answer: "Not Given", at: 3200 },
  { q: "Bees learned faces in a single trial.", answer: "False", at: 4800 },
];
const options = ["True", "False", "Not Given"];

/** Laptop · Reading: passage is highlighted as it's read, answers are picked, then marked. */
export function ReadingScene({ t }: SceneProps) {
  const marked = t >= 6000;
  const highlight = Math.min(100, (t / 4800) * 100);
  return (
    <div className="flex h-full flex-col text-brand-ink">
      <div className="flex items-center justify-between border-b border-brand-mist px-4 py-2 text-[10px] text-brand-teal">
        <span className="font-medium text-brand-ink">Reading · Passage 1</span>
        <span className={cn("transition-opacity", marked ? "text-brand-sea opacity-100" : "opacity-0")}>
          3 / 3 correct
        </span>
      </div>
      <div className="grid flex-1 grid-cols-2 overflow-hidden">
        <div className="space-y-2 border-r border-brand-mist p-4 text-[11px] leading-relaxed text-brand-teal">
          <p className="font-heading text-xs text-brand-ink">Can bees recognise faces?</p>
          <p>
            <span
              className="bg-no-repeat text-brand-ink transition-[background-size] duration-300"
              style={{
                backgroundImage:
                  "linear-gradient(color-mix(in oklab, #3fc48c 35%, transparent), color-mix(in oklab, #3fc48c 35%, transparent))",
                backgroundSize: `${highlight}% 100%`,
              }}
            >
              Researchers trained honeybees to link pictures of human faces with a sugary reward.
            </span>{" "}
            After several sessions, the bees returned to the correct face even without the reward.
          </p>
          <p>The findings suggest that face recognition may not need a large brain.</p>
        </div>
        <ol className="space-y-2.5 p-4">
          {questions.map((item, i) => {
            const chosen = t >= item.at;
            return (
              <li key={item.q} className="text-[11px]">
                <p className="flex gap-1.5">
                  <span className="text-brand-teal">{i + 1}.</span>
                  <span className="flex-1">{item.q}</span>
                  {marked && <Check className="size-3.5 text-brand-sea" strokeWidth={2} />}
                </p>
                <div className="mt-1 flex flex-wrap gap-1 pl-3.5">
                  {options.map((o) => (
                    <span
                      key={o}
                      className={cn(
                        "rounded-full border px-1.5 py-px text-[9px] transition-colors",
                        chosen && o === item.answer
                          ? "border-brand-primary bg-brand-primary text-brand-ink"
                          : "border-brand-mist text-brand-teal",
                      )}
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
