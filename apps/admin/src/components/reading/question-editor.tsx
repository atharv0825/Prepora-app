"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { ListeningQuestionInput, listeningQuestionTypeLabels } from "@prepora/shared/api/admin-listening";
import { ReadingQuestionInput } from "@prepora/shared/api/admin-reading";
import { type ListeningQuestionType, listeningQuestionTypes } from "@prepora/shared/ielts/listening";
import { letterLabel, readingQuestionTypes } from "@prepora/shared/ielts/reading";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { saveListeningQuestion } from "@/lib/listening-actions";
import { saveReadingQuestion } from "@/lib/reading-actions";
import {
  contentFromDraft,
  draftFromQuestion,
  emptyDraft,
  fieldErrors,
  hasList,
  isBankable,
  isLabellingType,
  isTypedDraft,
  labellingProblem,
  listLabel,
  paragraphLetters,
  promptHints,
  type QuestionDraft,
  usesGap,
} from "@/lib/reading-builder";
import { LabellingField } from "./labelling-field";
import { selectClass } from "./status";

type QuestionType = ListeningQuestionType;
export type BuilderModule = "reading" | "listening";
/** A saved question as either builder loads it. */
export type EditableQuestion = {
  id: string;
  q_no: number;
  q_type: QuestionType;
  prompt: string;
  options: Record<string, unknown>;
  answer: unknown;
  explanation: string | null;
};

const WORDS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"];
const LIST_NAME: Partial<Record<QuestionType, string>> = {
  matching_headings: "Headings",
  matching_features: "Features (people, places, dates…)",
  summary_completion: "Word bank",
  flowchart_completion: "Word bank",
  diagram_labelling: "Word bank",
};
const LIST_MAX: Partial<Record<QuestionType, number>> = { matching_headings: 15, matching_features: 10 };

/**
 * Add or edit one question (Reading M4-A1: 11 types in a passage; Listening M5-A1: 13 types in a
 * section, labelling included). The form changes with the type; whatever is typed is checked
 * against that type's contract here and again on the server, so a saved answer key always grades.
 */
export function QuestionEditor({
  module = "reading",
  testId,
  parentId,
  question,
  previous,
  onDone,
}: {
  module?: BuilderModule;
  testId: string;
  /** The passage (Reading) or section (Listening) the question belongs to. */
  parentId: string;
  question?: EditableQuestion;
  /** The question before this one, to carry its list, limits and picture over. */
  previous?: QuestionDraft;
  onDone: () => void;
}) {
  const types: readonly QuestionType[] = module === "reading" ? readingQuestionTypes : listeningQuestionTypes;
  const source = module === "reading" ? "the passage" : "the recording";
  const [d, setD] = useState<QuestionDraft>(() => (question ? draftFromQuestion(question) : emptyDraft(previous?.q_type ?? "tfng", previous)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (patch: Partial<QuestionDraft>) => setD((prev) => ({ ...prev, ...patch }));
  const id = (name: string) => `${question?.id ?? `new-${parentId}`}-${name}`;

  function changeType(q_type: QuestionType) {
    const next = emptyDraft(q_type, previous);
    setD({ ...next, prompt: d.prompt, explanation: d.explanation });
    setErrors({});
  }

  function save() {
    const picture = labellingProblem(d);
    if (picture) {
      setErrors({ image: picture });
      return;
    }
    const common = { test_id: testId, id: question?.id, ...contentFromDraft(d), explanation: d.explanation };
    const input = module === "reading" ? { ...common, passage_id: parentId } : { ...common, section_id: parentId };
    const checked = (module === "reading" ? ReadingQuestionInput : ListeningQuestionInput).safeParse(input);
    if (!checked.success) {
      setErrors(fieldErrors(checked.error.issues));
      return;
    }
    setErrors({});
    start(async () => {
      const result = module === "reading" ? await saveReadingQuestion(input) : await saveListeningQuestion(input);
      if (result.ok) {
        toast.success(result.message);
        onDone();
      } else {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.message);
      }
    });
  }

  const listItems = d.q_type === "mcq" ? d.choices : d.list;
  const answerChoices =
    d.q_type === "matching_information"
      ? paragraphLetters(d.paragraphs)
      : d.q_type === "map_labelling"
        ? d.points.map((_, i) => letterLabel(i))
      : hasList(d)
        ? d.list.map((_, i) => listLabel(d, i)).filter((_, i) => d.list[i]?.trim())
        : [];

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-primary/40 bg-background p-4" data-testid="question-editor">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={id("type")}>
          <select id={id("type")} value={d.q_type} onChange={(e) => changeType(e.target.value as QuestionType)} className={selectClass}>
            {types.map((t) => (
              <option key={t} value={t}>
                {listeningQuestionTypeLabels[t]}
              </option>
            ))}
          </select>
        </Field>
        {isBankable(d.q_type) && (
          <Field label="Students answer by" htmlFor={id("bank")}>
            <select id={id("bank")} value={d.bank ? "bank" : "typed"} onChange={(e) => set({ bank: e.target.value === "bank", label: "" })} className={selectClass}>
              <option value="typed">Typing words from {source}</option>
              <option value="bank">Choosing from a word bank</option>
            </select>
          </Field>
        )}
      </div>

      <Field label={d.q_type === "short_answer" || d.q_type === "mcq" ? "Question" : usesGap(d.q_type) ? "Text with the gap" : "Prompt"} htmlFor={id("prompt")} hint={promptHints[d.q_type]} error={errors.prompt}>
        <Textarea
          id={id("prompt")}
          value={d.prompt}
          onChange={(e) => set({ prompt: e.target.value })}
          rows={2}
          maxLength={2000}
          className="min-h-16"
          aria-invalid={errors.prompt ? true : undefined}
        />
      </Field>

      {isLabellingType(d.q_type) && (
        <LabellingField
          testId={testId}
          kind={d.q_type === "map_labelling" ? "map" : "diagram"}
          draft={d}
          onChange={(patch) => set(patch)}
          error={errors.image}
          idPrefix={id("img")}
        />
      )}

      {/* MCQ choices, or the list to match against. */}
      {(d.q_type === "mcq" || hasList(d)) && (
        <ListField
          name={d.q_type === "mcq" ? "Choices" : LIST_NAME[d.q_type] ?? "List"}
          items={listItems}
          label={(i) => (d.q_type === "mcq" ? letterLabel(i) : listLabel(d, i))}
          max={d.q_type === "mcq" ? 8 : LIST_MAX[d.q_type] ?? 15}
          // Adding or removing a row moves the letters: clear the answer then, not while typing.
          onChange={(items) =>
            d.q_type === "mcq"
              ? set({ choices: items, correct: items.length === d.choices.length ? d.correct : [] })
              : set({ list: items, label: items.length === d.list.length ? d.label : "" })
          }
          error={errors.list}
          hint={d.q_type !== "mcq" ? "Questions in a group share this list: the next question starts with a copy." : undefined}
        />
      )}

      {d.q_type === "matching_information" && (
        <Field label="Paragraph letters" htmlFor={id("paragraphs")} hint="The lettered paragraphs students choose from, e.g. A B C D E." error={errors.list}>
          <Input id={id("paragraphs")} value={d.paragraphs} onChange={(e) => set({ paragraphs: e.target.value, label: "" })} className="h-11 max-w-xs" />
        </Field>
      )}

      {(d.q_type === "matching_information" || d.q_type === "matching_features") && (
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" checked={d.reuse} onChange={(e) => set({ reuse: e.target.checked })} className="size-4 accent-primary" />
          Students may use a letter more than once
        </label>
      )}

      {/* The answer key. */}
      <fieldset className="flex flex-col gap-3 rounded-2xl bg-secondary/40 p-4">
        <legend className="sr-only">Answer</legend>
        <p className="text-sm font-semibold">Answer</p>
        {d.q_type === "mcq" && (
          <>
            <Field label="Students choose" htmlFor={id("select")}>
              <select
                id={id("select")}
                value={d.select}
                onChange={(e) => set({ select: Number(e.target.value), correct: [] })}
                className={`${selectClass} max-w-xs`}
              >
                <option value={1}>One letter</option>
                <option value={2}>TWO letters</option>
                <option value={3}>THREE letters</option>
              </select>
            </Field>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Correct letters">
              {d.choices.map((c, i) =>
                c.trim() ? (
                  <label key={i} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
                    <input
                      type={d.select > 1 ? "checkbox" : "radio"}
                      name={id("correct")}
                      checked={d.correct.includes(letterLabel(i))}
                      onChange={() => {
                        const l = letterLabel(i);
                        if (d.select === 1) return set({ correct: [l] });
                        set({ correct: d.correct.includes(l) ? d.correct.filter((x) => x !== l) : [...d.correct, l] });
                      }}
                      className="size-4 accent-primary"
                    />
                    {letterLabel(i)}
                  </label>
                ) : null,
              )}
            </div>
          </>
        )}

        {(d.q_type === "tfng" || d.q_type === "ynng") && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Correct answer">
            {(d.q_type === "tfng" ? ["true", "false", "not_given"] : ["yes", "no", "not_given"]).map((v) => (
              <label key={v} className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
                <input type="radio" name={id("value")} checked={d.value === v} onChange={() => set({ value: v })} className="size-4 accent-primary" />
                {v === "not_given" ? "Not given" : v[0]!.toUpperCase() + v.slice(1)}
              </label>
            ))}
          </div>
        )}

        {answerChoices.length > 0 && (
          <Field label="Correct label" htmlFor={id("label")}>
            <select id={id("label")} value={d.label} onChange={(e) => set({ label: e.target.value })} className={`${selectClass} max-w-xs`}>
              <option value="">Choose…</option>
              {answerChoices.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        )}

        {isTypedDraft(d) && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Word limit" htmlFor={id("max")}>
                <select id={id("max")} value={d.max_words} onChange={(e) => set({ max_words: Number(e.target.value) })} className={`${selectClass} w-52`}>
                  {WORDS.map((w, i) => (
                    <option key={w} value={i + 1}>
                      {i === 0 ? "ONE WORD ONLY" : `NO MORE THAN ${w} WORDS`}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={d.number_allowed}
                  onChange={(e) => set({ number_allowed: e.target.checked })}
                  className="size-4 accent-primary"
                />
                AND/OR A NUMBER
              </label>
            </div>
            <ListField
              name="Accepted answers"
              items={d.accept}
              label={(i) => (i === 0 ? "1st" : `${i + 1}.`)}
              max={10}
              min={1}
              onChange={(accept) => set({ accept })}
              hint="The first is shown as the answer. Case and punctuation don't matter; spelling does."
            />
          </>
        )}
        {errors.answer && (
          <p role="alert" className="text-sm text-destructive">
            {errors.answer}
          </p>
        )}
      </fieldset>

      <Field label="Explanation" htmlFor={id("explanation")} hint="Shown with the results: where the answer is in the passage, and why." error={errors.explanation}>
        <Textarea id={id("explanation")} value={d.explanation} onChange={(e) => set({ explanation: e.target.value })} rows={2} maxLength={4000} className="min-h-16" />
      </Field>

      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {errors.form}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving…" : question ? `Save question ${question.q_no}` : "Add question"}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {(error || hint) && <span className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{error ?? hint}</span>}
    </div>
  );
}

function ListField({
  name,
  items,
  label,
  max,
  min = 2,
  onChange,
  error,
  hint,
}: {
  name: string;
  items: string[];
  label: (i: number) => string;
  max: number;
  min?: number;
  onChange: (items: string[]) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium">{name}</legend>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-right text-sm font-semibold">{label(i)}</span>
          <Input
            value={item}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            maxLength={300}
            aria-label={`${name} ${label(i)}`}
            className="h-10"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={items.length <= min}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${label(i)}`}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="outline" disabled={items.length >= max} onClick={() => onChange([...items, ""])}>
          <Plus /> Add
        </Button>
        {(error || hint) && <span className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{error ?? hint}</span>}
      </div>
    </fieldset>
  );
}
