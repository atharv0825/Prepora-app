"use client";

import { cn } from "cn";
import { Input } from "@prepora/ui/components/input";
import { answerLabels, type ReadingQuestionType } from "@prepora/shared/ielts/reading";
import { isTyped, limitText, overWordLimit, type PlayerQuestion } from "@prepora/shared/ielts/questions";

// One question's answer control, for every Reading type (M4-F3) and Listening type (M5-F2):
//   * MCQ: the choices with their letters; "Choose TWO" uses checkboxes, capped at two.
//   * TFNG / YNNG: True / False / Not given (Yes / No / Not given).
//   * Matching (headings, information, features), word banks and map letters: the labels. When
//     the group shows the list above (`compact`), only the labels; long lists use a dropdown.
//   * Typed gaps (completion types, short answer, typed diagram labels): a text box in the gap,
//     with the word limit, and a warning once the answer is over it.

type Value = string | string[] | undefined;
type Props = {
  question: PlayerQuestion;
  value: Value;
  onChange: (value: string | string[]) => void;
  /** The group's list (headings, features, word bank) is shown above: show labels only. */
  compact?: boolean;
};

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const CHOICE_TEXT: Record<string, string> = { true: "True", false: "False", not_given: "Not given", yes: "Yes", no: "No" };
/** More labels than this: a dropdown instead of buttons. */
const DROPDOWN_FROM = 9;

/** What each label stands for (choice, heading, feature, word), in label order. */
function choiceTexts(q: PlayerQuestion): string[] {
  const o = q.options;
  if (q.q_type === "map_labelling" || q.q_type === "matching_information") return [];
  return strings(o.choices ?? o.features ?? o.headings ?? o.word_bank);
}

function labelsFor(q: PlayerQuestion): string[] {
  if (q.q_type === "map_labelling") {
    return Array.isArray(q.options.locations) ? (q.options.locations as { label: string }[]).map((l) => l.label) : [];
  }
  if (q.q_type === "diagram_labelling") return answerLabels({ q_type: "summary_completion", options: q.options });
  return answerLabels({ q_type: q.q_type as ReadingQuestionType, options: q.options });
}

/** How a bare label reads to a screen reader. */
function labelName(q: PlayerQuestion, label: string): string {
  if (q.q_type === "map_labelling") return `Place ${label}`;
  if (q.q_type === "matching_information") return `Paragraph ${label}`;
  if (q.q_type === "matching_headings") return `Heading ${label}`;
  return label;
}

export function QuestionField({ question: q, value, onChange, compact = false }: Props) {
  if (isTyped(q)) return <TypedGap question={q} value={value} onChange={onChange} />;

  const labels = labelsFor(q);
  const texts = compact ? [] : choiceTexts(q);
  const select = q.q_type === "mcq" && typeof q.options.select === "number" ? q.options.select : 1;
  const chosen = Array.isArray(value) ? value : value ? [value] : [];
  const bare = texts.length === 0 && !labels.some((l) => CHOICE_TEXT[l]);

  function pick(label: string) {
    if (select === 1) return onChange(q.q_type === "mcq" ? [label] : label);
    const next = chosen.includes(label) ? chosen.filter((l) => l !== label) : chosen.length < select ? [...chosen, label] : chosen;
    onChange([...next].sort());
  }

  const legend = (
    <span>
      {q.prompt}
      {select > 1 && <span className="ml-1 text-sm text-muted-foreground">(choose {select})</span>}
    </span>
  );

  if (labels.length >= DROPDOWN_FROM && select === 1) {
    const id = `q${q.q_no}`;
    return (
      <div className="flex flex-col gap-2" data-q={q.q_no}>
        <label htmlFor={id} className="flex gap-2">
          <QNo n={q.q_no} />
          {legend}
        </label>
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 max-w-full rounded-2xl border border-black/15 bg-white px-3 text-sm sm:w-auto"
        >
          <option value="">Choose…</option>
          {labels.map((label, i) => (
            <option key={label} value={label}>
              {texts[i] ? `${label}  ${texts[i]}` : labelName(q, label)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2" data-q={q.q_no}>
      <legend className="mb-2 flex gap-2">
        <QNo n={q.q_no} />
        {legend}
      </legend>
      <div className={cn("flex gap-2", bare ? "flex-wrap" : "flex-col")}>
        {labels.map((label, i) => {
          const on = chosen.includes(label);
          const text = texts[i] ?? CHOICE_TEXT[label];
          return (
            <label
              key={label}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition-colors has-focus-visible:ring-3 has-focus-visible:ring-ring/40",
                bare
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
              {text ? <span>{text}</span> : <span className="sr-only">{labelName(q, label)}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TypedGap({ question: q, value, onChange }: Omit<Props, "compact">) {
  const text = typeof value === "string" ? value : "";
  const limit = limitText(q.options);
  const over = overWordLimit(q, text);
  const [before, after] = /_{3,}/.test(q.prompt) ? q.prompt.split(/_{3,}/, 2) : [q.prompt, null];
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
