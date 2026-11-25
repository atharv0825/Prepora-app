"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminReadingQuestion } from "@prepora/shared/api/admin-reading";
import { readingQuestionTypeLabels } from "@prepora/shared/ielts/reading";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import { toast } from "@prepora/ui/components/sonner";
import { deleteReadingQuestion, moveReadingQuestion } from "@/lib/reading-actions";
import { draftFromQuestion } from "@/lib/reading-builder";
import { QuestionEditor } from "./question-editor";

/** The key in a few characters: "B", "A, C", "True", "the mayor (+1)". */
export function answerSummary(q: Pick<AdminReadingQuestion, "answer">): string {
  const a = (q.answer ?? {}) as { labels?: string[]; value?: string; label?: string; accept?: string[] };
  if (a.labels) return a.labels.join(", ");
  if (a.value) return a.value === "not_given" ? "Not given" : a.value[0]!.toUpperCase() + a.value.slice(1);
  if (a.label) return a.label;
  if (a.accept?.length) return a.accept.length > 1 ? `${a.accept[0]} (+${a.accept.length - 1})` : a.accept[0]!;
  return "—";
}

/**
 * A passage's questions in the builder (M4-A1): number, type, prompt and key, with edit, move
 * (within the passage) and delete; "Add question" opens the editor below the last one. Numbers
 * run through the test in passage order and are kept that way by the server.
 */
export function QuestionList({
  testId,
  passageId,
  questions,
  total,
}: {
  testId: string;
  passageId: string;
  questions: AdminReadingQuestion[];
  /** Questions in the whole test (40 at most). */
  total: number;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const last = questions[questions.length - 1];

  function act(fn: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.message);
      else if (result.message) toast.success(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid={`questions-${passageId}`}>
      {questions.length === 0 && editing !== "new" && <p className="text-sm text-muted-foreground">No questions for this passage yet.</p>}
      <ol className="flex flex-col gap-2">
        {questions.map((q, i) =>
          editing === q.id ? (
            <li key={q.id}>
              <QuestionEditor
                testId={testId}
                passageId={passageId}
                question={q}
                previous={i > 0 ? draftFromQuestion(questions[i - 1]!) : undefined}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={q.id} className="flex flex-col gap-2 rounded-2xl border border-border px-3 py-3 sm:flex-row sm:items-center" data-q={q.q_no}>
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold">{q.q_no}</span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="line-clamp-2 text-sm">{q.prompt}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{readingQuestionTypeLabels[q.q_type]}</Badge>
                    <span>
                      Answer: <span className="font-medium text-foreground">{answerSummary(q)}</span>
                    </span>
                    {!q.explanation && <span className="text-amber-700">No explanation</span>}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 gap-1 self-end sm:self-auto">
                <Button size="icon" variant="ghost" disabled={pending || i === 0} onClick={() => act(() => moveReadingQuestion(testId, q.id, "up"))} aria-label={`Move question ${q.q_no} up`}>
                  <ArrowUp />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={pending || i === questions.length - 1}
                  onClick={() => act(() => moveReadingQuestion(testId, q.id, "down"))}
                  aria-label={`Move question ${q.q_no} down`}
                >
                  <ArrowDown />
                </Button>
                <Button size="icon" variant="ghost" disabled={pending || editing !== null} onClick={() => setEditing(q.id)} aria-label={`Edit question ${q.q_no}`}>
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Delete question ${q.q_no}? Later questions are renumbered.`)) act(() => deleteReadingQuestion(testId, q.id));
                  }}
                  aria-label={`Delete question ${q.q_no}`}
                >
                  <Trash2 />
                </Button>
              </span>
            </li>
          ),
        )}
      </ol>
      {editing === "new" ? (
        <QuestionEditor testId={testId} passageId={passageId} previous={last ? draftFromQuestion(last) : undefined} onDone={() => setEditing(null)} />
      ) : (
        <div>
          <Button variant="outline" disabled={pending || editing !== null || total >= 40} onClick={() => setEditing("new")}>
            <Plus /> Add question
          </Button>
          {total >= 40 && <span className="ml-3 text-xs text-muted-foreground">40 questions: the test is full.</span>}
        </div>
      )}
    </div>
  );
}
