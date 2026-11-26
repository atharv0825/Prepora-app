import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import type { WritingCorrection, WritingFeedback } from "@prepora/shared/api/score-writing";
import { criterionLabel, writingCriteria, type WritingScores, type WritingTaskNo } from "@prepora/shared/ielts/writing";
import { routes } from "@/lib/routes";
import { correctionSegments } from "@/lib/writing/writing";

export type FeedbackModel = {
  taskNo: WritingTaskNo;
  kindLabel: string;
  title: string;
  prompt: string | null;
  text: string;
  wordCount: number;
  minWords: number;
  scores: WritingScores;
  band: number;
  feedback: WritingFeedback;
  inputMode: "typed" | "photo";
  date: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  spelling: "Spelling",
  punctuation: "Punctuation",
  cohesion: "Cohesion",
  style: "Style",
};

/**
 * M6-F3: one scored answer. Gold/Platinum (feedback.detail "full"): band per criterion, the answer
 * with numbered inline corrections, strengths, improvements and the model answer. Free ("summary"):
 * the bands and the summary; the rest is shown locked with an upgrade prompt, saying how many
 * corrections were found. The feedback comes as stored: a Free row never holds the full version.
 */
export function WritingFeedbackView({ model }: { model: FeedbackModel }) {
  const { feedback } = model;
  const full = feedback.detail === "full" ? feedback : null;
  const under = model.wordCount < model.minWords;

  return (
    <div className="flex flex-col gap-8" data-testid="writing-feedback">
      <section className="flex flex-col gap-6 rounded-3xl bg-secondary p-6 sm:p-8" aria-label="Your score">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Estimated band for this task</p>
            <p className="text-display font-semibold" data-testid="band">
              {model.band.toFixed(1)}
            </p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end sm:text-right">
            <Badge variant="outline">{model.kindLabel}</Badge>
            <span data-testid="word-count" className={cn(under && "font-medium text-destructive")}>
              {model.wordCount} words{under ? ` (under the ${model.minWords}-word minimum)` : ""}
            </span>
            {model.date && <span>{model.date}</span>}
            {model.inputMode === "photo" && <span>From a photo of your handwriting</span>}
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Band per criterion">
          {writingCriteria.map((c) => (
            <li key={c} className="flex flex-col gap-2 rounded-2xl bg-card p-4" data-testid={`criterion-${c}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{criterionLabel(c, model.taskNo)}</span>
                <span className="text-xl font-semibold tabular-nums">{model.scores[c].toFixed(1)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${(model.scores[c] / 9) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="leading-relaxed" data-testid="summary">
          {feedback.summary}
        </p>
        <p className="text-xs text-muted-foreground">
          An AI estimate based on the public IELTS band descriptors, for practice. Official scores can differ.
        </p>
      </section>

      {full ? <FullFeedback model={model} corrections={full.corrections} strengths={full.strengths} improvements={full.improvements} modelAnswer={full.model_answer} /> : (
        <LockedFeedback model={model} correctionsCount={feedback.detail === "summary" ? feedback.corrections_count : 0} />
      )}
    </div>
  );
}

function FullFeedback({
  model,
  corrections,
  strengths,
  improvements,
  modelAnswer,
}: {
  model: FeedbackModel;
  corrections: WritingCorrection[];
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}) {
  const segments = correctionSegments(model.text, corrections);
  return (
    <>
      <section className="flex flex-col gap-3" aria-label="Your answer">
        <h2 className="text-h3">Your answer</h2>
        {corrections.length > 0 && (
          <p className="text-sm text-muted-foreground">Highlighted words have a numbered correction below.</p>
        )}
        <div className="whitespace-pre-wrap rounded-3xl border border-foreground/5 bg-card p-5 leading-relaxed sm:p-6" data-testid="answer-text">
          {segments.map((s, i) =>
            s.correction === undefined ? (
              <span key={i}>{s.text}</span>
            ) : (
              <a
                key={i}
                href={`#correction-${s.correction + 1}`}
                className="rounded bg-amber-200/70 px-0.5 text-inherit no-underline decoration-amber-600 hover:underline dark:bg-amber-500/30"
                title={corrections[s.correction]!.suggestion ? `→ ${corrections[s.correction]!.suggestion}` : corrections[s.correction]!.explanation}
              >
                {s.text}
                <sup className="ml-0.5 text-[0.65em] font-semibold">{s.correction + 1}</sup>
              </a>
            ),
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-label="Corrections">
        <h2 className="text-h3">Corrections</h2>
        {corrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No corrections: nothing needed fixing.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card">
            {corrections.map((c, i) => (
              <li key={i} id={`correction-${i + 1}`} className="flex scroll-mt-24 flex-col gap-1.5 p-4 text-sm" data-testid="correction">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                  <Badge variant="secondary">{CATEGORY_LABEL[c.category] ?? c.category}</Badge>
                </div>
                <p>
                  <del className="text-muted-foreground">{c.original}</del>
                  {c.suggestion && (
                    <>
                      {" "}
                      <span aria-hidden>→</span> <ins className="font-medium no-underline">{c.suggestion}</ins>
                    </>
                  )}
                </p>
                <p className="text-muted-foreground">{c.explanation}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <PointList title="What you did well" items={strengths} testId="strengths" />
        <PointList title="How to raise your score" items={improvements} testId="improvements" />
      </div>

      <section aria-label="Model answer">
        <details className="group rounded-3xl border border-foreground/5 bg-card p-5 sm:p-6" data-testid="model-answer">
          <summary className="cursor-pointer text-h3 marker:text-muted-foreground">Model answer</summary>
          <p className="mt-2 text-sm text-muted-foreground">A band 9 answer to the same task, to compare with yours.</p>
          <div className="mt-4 whitespace-pre-wrap leading-relaxed">{modelAnswer}</div>
        </details>
      </section>
    </>
  );
}

function PointList({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-foreground/5 bg-card p-5" aria-label={title} data-testid={testId}>
      <h2 className="text-h3">{title}</h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
        {items.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </section>
  );
}

function LockedFeedback({ model, correctionsCount }: { model: FeedbackModel; correctionsCount: number }) {
  const locked = [
    {
      title: correctionsCount === 1 ? "1 correction found" : `${correctionsCount} corrections found`,
      body: "See each mistake highlighted in your answer, with the fix and why.",
    },
    { title: "Strengths and next steps", body: "What you did well and the changes that would raise your band most." },
    { title: "Model answer", body: "A band 9 answer to the same task, to compare with yours." },
  ];
  return (
    <section className="flex flex-col gap-4" aria-label="Detailed feedback" data-testid="locked-feedback">
      <div className="whitespace-pre-wrap rounded-3xl border border-foreground/5 bg-card p-5 leading-relaxed sm:p-6" data-testid="answer-text">
        {model.text}
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {locked.map((l) => (
          <li key={l.title} className="flex flex-col gap-2 rounded-3xl border border-dashed border-foreground/15 bg-card p-5">
            <span className="flex items-center gap-2 font-medium">
              <Lock className="size-4 text-muted-foreground" aria-hidden /> {l.title}
            </span>
            <span className="text-sm text-muted-foreground">{l.body}</span>
          </li>
        ))}
      </ul>
      <div className="mint flex flex-col gap-3 rounded-3xl bg-background p-5 text-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4" aria-hidden /> Detailed feedback is part of Gold.
        </p>
        <Link href={routes.upgrade} className={cn(buttonVariants(), "self-start sm:self-auto")}>
          Upgrade to Gold
        </Link>
      </div>
    </section>
  );
}
