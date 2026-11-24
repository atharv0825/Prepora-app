"use client";

import { cn } from "cn";
import { Input } from "@prepora/ui/components/input";
import type { PublicListeningQuestion } from "@prepora/shared/api/listening-test";
import { answerLabels, type ReadingQuestionType } from "@prepora/shared/ielts/reading";
import { isTyped, limitText, overWordLimit } from "@/lib/listening/answers";

type Value = string | string[] | undefined;
type Props = { question: PublicListeningQuestion; value: Value; onChange: (value: string | string[]) => void };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const CHOICE_TEXT: Record<string, string> = { true: "True", false: "False", not_given: "Not given", yes: "Yes", no: "No" };

/** The words/places/features each label stands for, for showing next to the letter. */
function choiceTexts(q: PublicListeningQuestion): string[] {
  const o = q.options;
  if (q.q_type === "map_labelling") return [];
  return strings(o.choices ?? o.features ?? o.headings ?? o.word_bank);
}

function labelsFor(q: PublicListeningQuestion): string[] {
  if (q.q_type === "map_labelling") {
    return Array.isArray(q.options.locations) ? (q.options.locations as { label: string }[]).map((l) => l.label) : [];
  }
  if (q.q_type === "diagram_labelling") return answerLabels({ q_type: "summary_completion", options: q.options });
  return answerLabels({ q_type: q.q_type as ReadingQuestionType, options: q.options });
}

/** One question's answer control (every type but the labelling layout, which wraps this). */
export function QuestionField({ question: q, value, onChange }: Props) {
  if (isTyped(q)) return <TypedGap question={q} value={value} onChange={onChange} />;

  const labels = labelsFor(q);
  const texts = choiceTexts(q);
  const select = q.q_type === "mcq" && typeof q.options.select === "number" ? q.options.select : 1;
  const chosen = Array.isArray(value) ? value : value ? [value] : [];

  function pick(label: string) {
    if (select === 1) return onChange(q.q_type === "mcq" ? [label] : label);
    const next = chosen.includes(label) ? chosen.filter((l) => l !== label) : chosen.length < select ? [...chosen, label] : chosen;
    onChange([...next].sort());
  }

  return (
    <fieldset className="flex flex-col gap-2" data-q={q.q_no}>
      <legend className="mb-2 flex gap-2">
        <QNo n={q.q_no} />
        <span>
          {q.prompt}
          {select > 1 && <span className="ml-1 text-sm text-muted-foreground">(choose {select})</span>}
        </span>
      </legend>
      <div className={cn("flex gap-2", texts.length ? "flex-col" : "flex-wrap")} role={q.q_type === "map_labelling" ? "radiogroup" : undefined}>
        {labels.map((label, i) => {
          const on = chosen.includes(label);
          return (
            <label
              key={label}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition-colors",
                q.q_type === "map_labelling"
                  ? "min-w-11 justify-center border-transparent px-1.5"
                  : on
                    ? "border-primary bg-primary/10"
                    : "border-black/10 hover:border-primary/60",
              )}
            >
              <input
                type={select > 1 ? "checkbox" : "radio"}
                name={`q${q.q_no}`}
                value={label}
                checked={on}
                onChange={() => pick(label)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-black/15",
                )}
              >
                {CHOICE_TEXT[label] ? label[0]!.toUpperCase() : label}
              </span>
              {/* Map letters stand alone: the places are on the map. */}
              {texts[i] || CHOICE_TEXT[label] ? <span>{texts[i] ?? CHOICE_TEXT[label]}</span> : <span className="sr-only">Place {label}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TypedGap({ question: q, value, onChange }: Props) {
  const text = typeof value === "string" ? value : "";
  const limit = limitText(q.options);
  const over = overWordLimit(q, text);
  const [before, after] = q.prompt.includes("___") ? q.prompt.split(/_{3,}/, 2) : [q.prompt, null];
  const id = `q${q.q_no}`;

  return (
    <div className="flex flex-col gap-1.5" data-q={q.q_no}>
      <label htmlFor={id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <QNo n={q.q_no} />
        <span>{before}</span>
        {after !== null && (
          <>
            <GapInput id={id} value={text} over={over} onChange={onChange} />
            <span>{after}</span>
          </>
        )}
      </label>
      {after === null && <GapInput id={id} value={text} over={over} onChange={onChange} />}
      <p className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
        {over ? `Too long: ${limit?.toLowerCase()}. It would be marked wrong.` : limit}
      </p>
    </div>
  );
}

function GapInput({ id, value, over, onChange }: { id: string; value: string; over: boolean; onChange: (v: string) => void }) {
  return (
    <Input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={200}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-invalid={over || undefined}
      className="h-9 w-44 max-w-full"
    />
  );
}

export function QNo({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold", className)}>
      {n}
    </span>
  );
}
