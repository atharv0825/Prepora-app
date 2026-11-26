"use client";

import { useActionState, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import type { BuilderState } from "@/lib/builder-server";
import { PART1_THEMES } from "@prepora/shared/api/admin-speaking";
import { saveCueCard, savePart1, savePart3 } from "@/lib/speaking-actions";
import { submitKeepingInput } from "../form-submit";

type Values = { title: string; items: string[] };
type Props =
  | { kind: "card"; topicId?: string; values?: Values }
  | { kind: "part1"; topicId?: string; values?: Values }
  | { kind: "part3"; topicId?: string; parentId: string; values?: Values };

const PLACEHOLDERS = {
  card: { title: "Describe a place you like to visit in your free time", items: ["where it is", "how often you go there", "what you do there", "and explain why you like it"] },
  part1: {
    title: "Hometown",
    items: ["Where is your hometown?", "What do you like most about it?", "Has it changed much since you were a child?", "Would you like to live there in the future?", "Is it a good place for young people?"],
  },
  part3: { title: "Tourism and its effects", items: ["Why do people travel abroad?", "Is tourism always good for local people?", "How might tourism change in the future?", "Should governments limit tourist numbers?"] },
} as const;

/**
 * A Part 2 cue card (task + 2–5 "You should say" points, M7-A1), a Part 1 question set (a theme
 * such as work, hometown or hobbies + the examiner's questions, M8-A1) or a Part 3 discussion
 * (theme + questions, linked to its card). Rows can be added, removed and reordered; blank rows are
 * ignored. Without a topic id it creates a draft and opens it.
 */
export function TopicForm(props: Props) {
  const card = props.kind === "card";
  const max = card ? 5 : 12;
  const [items, setItems] = useState<string[]>(props.values?.items.length ? props.values.items : props.kind === "part1" ? ["", "", "", "", ""] : ["", "", "", ""]);
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = card ? await saveCueCard(prev, form) : props.kind === "part1" ? await savePart1(prev, form) : await savePart3(prev, form);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (n: string) => `${props.topicId ?? "new"}-${props.kind}-${n}`;
  const itemName = card ? "point" : "question";
  const listError = errors[card ? "points" : "questions"];

  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const next = [...xs];
      [next[i], next[i + d]] = [next[i + d]!, next[i]!];
      return next;
    });

  return (
    <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5" aria-label={card ? "Cue card" : props.kind === "part1" ? "Part 1 question set" : "Part 3 discussion"}>
      {props.topicId && <input type="hidden" name="topic_id" value={props.topicId} />}
      {props.kind === "part3" && <input type="hidden" name="parent_topic_id" value={props.parentId} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("title")} className="text-sm font-medium">
          {card ? "Task" : "Theme"}
        </label>
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={props.values?.title}
          placeholder={PLACEHOLDERS[props.kind].title}
          list={props.kind === "part1" ? id("themes") : undefined}
          aria-invalid={errors.title ? true : undefined}
          className="h-11"
        />
        {props.kind === "part1" && (
          <datalist id={id("themes")}>
            {PART1_THEMES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
        {errors.title && <span className="text-xs text-destructive">{errors.title}</span>}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {card ? "You should say: (2–5 points, in order)" : props.kind === "part1" ? "The examiner's questions (at least 4; 4–5 are asked)" : "The examiner's questions (in order)"}
        </legend>
        <ol className="flex flex-col gap-2">
          {items.map((v, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-5 text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              <Input
                name={itemName}
                value={v}
                onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                maxLength={card ? 200 : 300}
                aria-label={`${card ? "Point" : "Question"} ${i + 1}`}
                placeholder={PLACEHOLDERS[props.kind].items[i]}
                className="h-10"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${i + 1} up`}>
                <ArrowUp />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${i + 1} down`}>
                <ArrowDown />
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} disabled={items.length <= 1} aria-label={`Remove ${i + 1}`}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
        {items.length < max && (
          <Button type="button" variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, ""])} className="self-start">
            <Plus /> Add {card ? "a point" : "a question"}
          </Button>
        )}
        {listError && <span className="text-xs text-destructive">{listError}</span>}
      </fieldset>

      <Button type="submit" disabled={pending} className="h-11 self-start">
        {pending ? "Saving…" : props.topicId ? "Save" : card ? "Create cue card" : props.kind === "part1" ? "Create question set" : "Add Part 3 discussion"}
      </Button>
    </form>
  );
}
