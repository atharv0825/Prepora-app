import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import type { BetterPhrase, SpeakingFeedback, SpeakingSignals } from "@prepora/shared/api/score-speaking";
import { PART2_MIN_SECONDS, speakingCriteria, speakingCriterionLabel, type SpeakingScores } from "@prepora/shared/ielts/speaking";
import { routes } from "@/lib/routes";
import { mmss, transcriptPieces } from "@/lib/speaking/speaking";

export type SpeakingFeedbackModel = {
  title: string;
  transcript: string;
  signals: SpeakingSignals;
  fillers: { word: string; count: number }[];
  scores: SpeakingScores;
  band: number;
  feedback: SpeakingFeedback;
  date: string | null;
  /** A signed URL to the student's own recording, while it's kept (30 days). */
  audioUrl: string | null;
};

/**
 * M7-F3: one scored Speaking answer. Everyone: the band, four criteria, the measured signals, the
 * transcript with fillers highlighted. Gold/Platinum: numbered better phrases in the transcript
 * and listed, strengths, improvements and a model answer. Free: those are shown locked, with how
 * many better phrases were found, and an upgrade prompt. As stored: a Free row holds no more.
 */
export function SpeakingFeedbackView({ model }: { model: SpeakingFeedbackModel }) {
  const { feedback, signals } = model;
  const full = feedback.detail === "full" ? feedback : null;
  const phrases: BetterPhrase[] = full?.better_phrases ?? [];
  const pieces = transcriptPieces(model.transcript, phrases);
  const short = signals.duration_sec < PART2_MIN_SECONDS;

  return (
    <div className="flex flex-col gap-8" data-testid="speaking-feedback">
      <section className="flex flex-col gap-6 rounded-3xl bg-secondary p-6 sm:p-8" aria-label="Your score">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Estimated band for this answer</p>
            <p className="text-display font-semibold" data-testid="band">
              {model.band.toFixed(1)}
            </p>
          </div>
          {model.date && <p className="text-sm text-muted-foreground">{model.date}</p>}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Band per criterion">
          {speakingCriteria.map((c) => (
            <li key={c} className="flex flex-col gap-2 rounded-2xl bg-card p-4" data-testid={`criterion-${c}`}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{speakingCriterionLabel(c)}</span>
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
          An AI estimate from your transcript and how you spoke, for practice. Pronunciation is judged on how easy you are to understand, never on your accent.
        </p>
      </section>

      <section aria-label="How you spoke" className="flex flex-col gap-3">
        <h2 className="text-h3">How you spoke</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="signals">
          <Stat label="Length" value={mmss(signals.duration_sec)} note={short ? "under 1 minute" : undefined} warn={short} />
          <Stat label="Speaking rate" value={signals.words_per_minute !== null ? `${signals.words_per_minute} wpm` : "—"} note="natural speech is about 110–170" />
          <Stat label="Pauses (1 s+)" value={signals.pauses !== null ? String(signals.pauses) : "—"} note={signals.longest_pause_sec ? `longest ${signals.longest_pause_sec} s` : undefined} />
          <Stat label="Fillers" value={String(signals.filler_count)} note={model.fillers.map((f) => `${f.word} ×${f.count}`).join(", ") || "none"} />
        </dl>
      </section>

      {model.audioUrl && (
        <section aria-label="Your recording" className="flex flex-col gap-2">
          <h2 className="text-h3">Your recording</h2>
          <audio controls src={model.audioUrl} className="w-full" data-testid="recording-playback" />
          <p className="text-xs text-muted-foreground">Kept for 30 days.</p>
        </section>
      )}

      <section aria-label="Transcript" className="flex flex-col gap-3">
        <h2 className="text-h3">What you said</h2>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            <mark className="rounded bg-amber-200/70 px-1 text-inherit dark:bg-amber-500/30">um</mark> fillers
          </span>
          {full && phrases.length > 0 && (
            <span>
              <mark className="rounded bg-sky-200/70 px-1 text-inherit dark:bg-sky-500/30">phrase¹</mark> a better way to say it, below
            </span>
          )}
        </p>
        <div className="rounded-3xl border border-foreground/5 bg-card p-5 leading-relaxed sm:p-6" data-testid="transcript">
          {pieces.map((p, i) =>
            p.filler ? (
              <mark key={i} className="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30" data-filler>
                {p.text}
              </mark>
            ) : p.phrase !== undefined ? (
              <a key={i} href={`#phrase-${p.phrase + 1}`} className="rounded bg-sky-200/70 px-0.5 text-inherit no-underline hover:underline dark:bg-sky-500/30">
                {p.text}
                <sup className="ml-0.5 text-[0.65em] font-semibold">{p.phrase + 1}</sup>
              </a>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </div>
      </section>

      {full ? (
        <>
          <section aria-label="Better phrases" className="flex flex-col gap-3">
            <h2 className="text-h3">Better ways to say it</h2>
            {phrases.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to suggest this time.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card">
                {phrases.map((p, i) => (
                  <li key={i} id={`phrase-${i + 1}`} className="flex scroll-mt-24 flex-col gap-1 p-4 text-sm" data-testid="better-phrase">
                    <p>
                      <span className="mr-2 font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="text-muted-foreground">&ldquo;{p.original}&rdquo;</span> <span aria-hidden>→</span>{" "}
                      <span className="font-medium">&ldquo;{p.better}&rdquo;</span>
                    </p>
                    <p className="text-muted-foreground">{p.why}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            <Points title="What you did well" items={full.strengths} testId="strengths" />
            <Points title="How to raise your score" items={full.improvements} testId="improvements" />
          </div>
          <section aria-label="Model answer">
            <details className="rounded-3xl border border-foreground/5 bg-card p-5 sm:p-6" data-testid="model-answer">
              <summary className="cursor-pointer text-h3">Model answer</summary>
              <p className="mt-2 text-sm text-muted-foreground">A band 9 answer to the same card. Try saying it aloud.</p>
              <div className="mt-4 whitespace-pre-wrap leading-relaxed">{full.model_answer}</div>
            </details>
          </section>
        </>
      ) : (
        <section className="flex flex-col gap-4" aria-label="Detailed feedback" data-testid="locked-feedback">
          <ul className="grid gap-3 md:grid-cols-3">
            {[
              {
                title: `${feedback.detail === "summary" ? feedback.better_phrases_count : 0} better ${feedback.detail === "summary" && feedback.better_phrases_count === 1 ? "phrase" : "phrases"} found`,
                body: "More natural and advanced ways to say what you said, highlighted in your transcript.",
              },
              { title: "Strengths and next steps", body: "What you did well and the changes that would raise your band most." },
              { title: "Model answer", body: "A band 9 answer to the same cue card to practise with." },
            ].map((l) => (
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
      )}
    </div>
  );
}

function Stat({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-foreground/5 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-lg font-semibold tabular-nums", warn && "text-amber-700 dark:text-amber-400")}>{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Points({ title, items, testId }: { title: string; items: string[]; testId: string }) {
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
