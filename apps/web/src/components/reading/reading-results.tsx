import Link from "next/link";
import { Check, X } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@prepora/ui/components/badge";
import type { QuestionResult } from "@prepora/shared/api/grade-test";
import { readingQuestionTypeLabels } from "@prepora/shared/ielts/reading";
import { displayAnswer } from "@prepora/shared/ielts/questions";
import { listeningAttemptPath, readingAttemptPath } from "@/lib/routes";

// Results (M4-F4): band and score, then every question (grouped by passage when the test can
// still be opened) with the student's answer, the correct answer and the explanation; and the
// student's attempts at this test. Server components.

export function ScoreCard({
  band,
  rawScore,
  total,
  testType,
  duration,
  date,
}: {
  band: number;
  rawScore: number;
  total: number | null;
  testType: string | null;
  duration: string | null;
  date: string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-secondary p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8" aria-label="Your score">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Estimated Reading band</p>
        <p className="text-display font-semibold" data-testid="band">
          {band.toFixed(1)}
        </p>
        <p data-testid="raw-score">{total !== null ? `${rawScore} of ${total} correct` : `${rawScore} correct`}</p>
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end sm:text-right">
        {testType && <Badge variant="outline">{testType}</Badge>}
        <p>{date}</p>
        {duration && <p>Time taken: {duration}</p>}
        {total !== null && total < 40 && <p className="max-w-xs">A shorter practice test: the score is scaled to 40 questions for the band.</p>}
      </div>
    </section>
  );
}

export function ResultList({
  title,
  results,
  prompts,
}: {
  title: string;
  results: readonly QuestionResult[];
  prompts: ReadonlyMap<number, string>;
}) {
  const correct = results.filter((r) => r.correct).length;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-h3">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {correct}/{results.length}
        </p>
      </div>
      <ol className="flex flex-col divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
        {results.map((r) => (
          <li key={r.q_no} className="flex gap-3 p-4" data-q={r.q_no} data-correct={r.correct}>
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full",
                r.correct ? "bg-primary text-primary-foreground" : "bg-destructive/10 text-destructive",
              )}
              role="img"
              aria-label={r.correct ? "Correct" : "Wrong"}
            >
              {r.correct ? <Check className="size-4" /> : <X className="size-4" />}
            </span>
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <p className="font-medium">
                {r.q_no}. {prompts.get(r.q_no) ?? readingQuestionTypeLabels[r.q_type]}
              </p>
              <p>
                Your answer: <span className="font-medium">{displayAnswer(r.given)}</span>
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
        ))}
      </ol>
    </section>
  );
}

export type HistoryItem = {
  id: string;
  date: string;
  title: string;
  rawScore: number;
  band: number;
  /** Extra words after the date, e.g. "exam mode". */
  note?: string | null;
};

/** Attempt history (Reading or Listening): newest first, each linking to its results. */
export function AttemptHistory({
  title,
  items,
  currentId,
  module = "reading",
}: {
  title: string;
  items: readonly HistoryItem[];
  currentId?: string;
  module?: "reading" | "listening";
}) {
  const pathOf = module === "reading" ? readingAttemptPath : listeningAttemptPath;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-h3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tests taken yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/5 rounded-2xl border border-black/5 bg-white">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={pathOf(a.id)}
                aria-current={a.id === currentId ? "page" : undefined}
                className={cn("flex items-center justify-between gap-3 p-4 text-sm hover:bg-secondary/40", a.id === currentId && "bg-secondary/60")}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{a.title}</span>
                  <span className="text-muted-foreground">
                    {a.date} · {a.rawScore} correct
                    {a.note ? ` · ${a.note}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-lg font-semibold tabular-nums">{a.band.toFixed(1)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
