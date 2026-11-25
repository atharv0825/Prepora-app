"use client";

import { Check, X } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import type { ListeningQuestionResult } from "@prepora/shared/api/listening-test";
import { sectionOfQuestion } from "@prepora/shared/ielts/listening";
import { displayAnswer, type ListeningResultsData, sectionScores } from "@/lib/listening/answers";

/**
 * M5-F3: results after submission. Band and score, a score per part, every question with the
 * student's answer, the correct answer and why, and each part's transcript, which the student
 * sees here for the first time (the player never receives it).
 */
export function ListeningResults({ data, onRetry }: { data: ListeningResultsData; onRetry?: () => void }) {
  const scores = sectionScores(data.results);

  return (
    <div className="flex flex-col gap-8" data-testid="listening-results">
      <section className="flex flex-col items-start gap-4 rounded-3xl bg-secondary p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Estimated Listening band</p>
          <p className="text-display font-semibold" data-testid="band">
            {data.band.toFixed(1)}
          </p>
          <p data-testid="raw-score">
            {data.raw_score} of {data.total} correct
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Badge variant={data.mode === "exam" ? "default" : "outline"}>{data.mode === "exam" ? "Exam mode" : "Practice mode"}</Badge>
          {data.mode === "practice" && (
            <p className="max-w-xs text-sm text-muted-foreground sm:text-right">
              You could replay and seek, so this band may read high. Exam mode plays each part once, as on test day.
            </p>
          )}
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Take it again
            </Button>
          )}
        </div>
      </section>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Score by part">
        {scores.map((s) => (
          <li key={s.section} className="rounded-2xl border border-foreground/5 bg-card p-4">
            <p className="text-sm text-muted-foreground">Part {s.section}</p>
            <p className="text-xl font-semibold">
              {s.correct}/{s.total}
            </p>
          </li>
        ))}
      </ul>

      {scores.map((s) => {
        const transcript = data.transcripts.find((t) => t.order_no === s.section);
        return (
          <section key={s.section} className="flex flex-col gap-4" aria-labelledby={`part-${s.section}`}>
            <h2 id={`part-${s.section}`} className="text-h3">
              {transcript?.title ?? `Part ${s.section}`}
            </h2>
            <ol className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card">
              {data.results
                .filter((r) => sectionOfQuestion(r.q_no) === s.section)
                .map((r) => (
                  <ResultRow key={r.q_no} result={r} />
                ))}
            </ol>
            {transcript && (
              <details className="group rounded-2xl border border-foreground/5 bg-card p-4" data-testid={`transcript-${s.section}`}>
                <summary className="cursor-pointer font-medium">Transcript</summary>
                <p className="mt-3 leading-relaxed whitespace-pre-line text-muted-foreground">{transcript.transcript}</p>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ResultRow({ result: r }: { result: ListeningQuestionResult }) {
  return (
    <li className="flex gap-3 p-4" data-q={r.q_no} data-correct={r.correct}>
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full",
          r.correct ? "bg-primary text-primary-foreground" : "bg-destructive/10 text-destructive",
        )}
        aria-label={r.correct ? "Correct" : "Wrong"}
      >
        {r.correct ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
      <div className="flex min-w-0 flex-col gap-1 text-sm">
        <p>
          <span className="font-semibold">{r.q_no}.</span> Your answer: <span className="font-medium">{displayAnswer(r.given)}</span>
          {r.note === "over_word_limit" && <span className="text-destructive"> (over the word limit)</span>}
        </p>
        {!r.correct && (
          <p>
            Correct answer: <span className="font-medium">{displayAnswer(r.correct_answer)}</span>
            {r.also_accepted.length > 0 && <span className="text-muted-foreground"> (also accepted: {r.also_accepted.join(", ")})</span>}
          </p>
        )}
        {r.explanation && <p className="text-muted-foreground">{r.explanation}</p>}
      </div>
    </li>
  );
}
