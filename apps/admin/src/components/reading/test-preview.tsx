"use client";

import { useMemo, useState } from "react";
import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import type { AdminReadingTest } from "@prepora/shared/api/admin-reading";
import { readingBand } from "@prepora/shared/ielts/bands";
import { type Answers, questionGroups, setAnswer } from "@prepora/shared/ielts/questions";
import { Button } from "@prepora/ui/components/button";
import { PassageText } from "@prepora/ui/components/ielts/passage-text";
import { QuestionGroupView } from "@prepora/ui/components/ielts/question-group";
// The exact marking code grade-test runs (import-free, so it loads here too).
import { gradeQuestion, type QuestionResult } from "../../../../../supabase/functions/_shared/reading";

/**
 * Preview as student (M4-A1): the passages and questions rendered by the same components as the
 * test player, answerable, with "Check answers" marking them as grade-test would. Nothing is
 * saved and no allowance is used. Works for drafts and tests above any plan.
 */
export function TestPreview({ data }: { data: AdminReadingTest }) {
  const passages = useMemo(() => [...data.passages].sort((a, b) => a.order_no - b.order_no), [data.passages]);
  const [current, setCurrent] = useState(passages[0]?.id ?? null);
  const [answers, setAnswers] = useState<Answers>({});
  const [results, setResults] = useState<Map<number, QuestionResult> | null>(null);
  const passage = passages.find((p) => p.id === current);
  const groups = useMemo(
    () => questionGroups(data.questions.filter((q) => q.passage_id === current).map(({ q_no, q_type, prompt, options }) => ({ q_no, q_type, prompt, options }))),
    [data.questions, current],
  );

  function check() {
    const graded = data.questions.map((q) => gradeQuestion({ ...q, explanation: q.explanation }, answers[String(q.q_no)]));
    setResults(new Map(graded.map((r) => [r.q_no, r])));
  }
  const score = results ? [...results.values()].filter((r) => r.correct).length : 0;
  const total = data.questions.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-secondary/40 px-4 py-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Passages">
          {passages.map((p) => (
            <Button key={p.id} role="tab" size="sm" aria-selected={p.id === current} variant={p.id === current ? "default" : "ghost"} onClick={() => setCurrent(p.id)}>
              Passage {p.order_no}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {results && (
            <span className="text-sm font-medium" data-testid="preview-score">
              {score} / {total} · band {readingBand(data.test.test_type, score, total)}
            </span>
          )}
          <Button size="sm" onClick={check} disabled={total === 0}>
            Check answers
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAnswers({});
              setResults(null);
            }}
          >
            <RotateCcw /> Reset
          </Button>
        </div>
      </div>

      {!passage ? (
        <p className="text-muted-foreground">Add a passage to preview the test.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <article className="flex flex-col gap-3 rounded-2xl border border-border p-5 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto" aria-label={passage.title}>
            <h2 className="text-h3">{passage.title}</h2>
            <PassageText body={passage.body} />
          </article>
          <div className="flex flex-col gap-8 rounded-2xl border border-border p-5 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
            {groups.length === 0 && <p className="text-muted-foreground">No questions for this passage yet.</p>}
            {groups.map((g) => (
              <div key={g.first} className="flex flex-col gap-4">
                <QuestionGroupView
                  group={g}
                  answers={answers}
                  onAnswer={(qNo, v) => {
                    setAnswers((a) => setAnswer(a, qNo, v));
                    setResults(null);
                  }}
                />
                {results && (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {g.questions.map((q) => {
                      const r = results.get(q.q_no);
                      if (!r) return null;
                      return (
                        <li key={q.q_no} className={`flex items-start gap-2 ${r.correct ? "text-primary" : "text-destructive"}`} data-result={q.q_no}>
                          {r.correct ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleX className="mt-0.5 size-4 shrink-0" />}
                          <span>
                            {q.q_no}. {r.correct ? "Correct" : `Answer: ${[r.correct_answer].flat().join(", ")}`}
                            {r.note === "over_word_limit" && " (over the word limit)"}
                            {r.explanation && <span className="block text-muted-foreground">{r.explanation}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
