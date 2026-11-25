"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn } from "cn";
import { Button } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@prepora/ui/components/dialog";
import type { GradeTestResponse } from "@prepora/shared/api/grade-test";
import type { ReadingTestPayload } from "@prepora/shared/api/reading-test";
import { useCredits } from "@/components/credits/credits-provider";
import { QuestionGroupView } from "@prepora/ui/components/ielts/question-group";
import { type Answers, answeredCount, isAnswered, questionGroups, setAnswer, toGradeAnswers } from "@prepora/shared/ielts/questions";
import {
  clock,
  parseReadingDraft,
  type Range,
  type ReadingDraft,
  readingDraftKey,
  secondsLeft,
  TEST_SECONDS,
  timerTone,
} from "@/lib/reading";
import { testTypeLabel } from "@/lib/dashboard";
import { readingAttemptPath, routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";
import { PassageView } from "./passage-view";

type Question = ReadingTestPayload["questions"][number];

/**
 * The Reading test player (M4-F2):
 *   * desktop (md+): once started it fills the screen below the header, like the computer-delivered
 *     test: the page itself doesn't scroll; the passage and the questions sit side by side, each
 *     scrolling in its own pane, centred in a max-width column;
 *   * mobile: a normal scrolling page with the Passage / Questions switch pinned at the top (each
 *     view keeps its scroll position), and Submit in place of Next on the last question;
 *   * Passage 1 / 2 / 3 tabs, and a navigator of every question number at the bottom
 *     (answered = filled, current = ringed) with Previous / Next;
 *   * a 60-minute timer that keeps running across reloads, turns amber at 10 minutes and red at
 *     5, and sends the answers when it reaches 0;
 *   * highlighting in the passage (passage-view.tsx);
 *   * answers, highlights and the start time saved on this device as they change.
 * Submitting calls grade-test (M4-B2) and opens the results (M4-F4).
 */
export function ReadingPlayer({ payload }: { payload: ReadingTestPayload }) {
  const router = useRouter();
  const { run } = useCredits();
  const key = readingDraftKey(payload.test.id);
  const passages = useMemo(() => [...payload.passages].sort((a, b) => a.order_no - b.order_no), [payload.passages]);

  const [draft, setDraft] = useState<ReadingDraft | null>(null);
  const [resumed, setResumed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [passageNo, setPassageNo] = useState(1);
  const [pane, setPane] = useState<"passage" | "questions">("passage");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const questionsPane = useRef<HTMLDivElement>(null);
  const navigator = useRef<HTMLElement>(null);
  /** Mobile: where each view was scrolled to, so switching back returns there. */
  const paneScroll = useRef<Record<"passage" | "questions", number | null>>({ passage: null, questions: null });
  const panesTop = useRef<HTMLDivElement>(null);
  /** The question being worked on: the navigator rings it; Previous / Next move from it. */
  const [current, setCurrent] = useState<number | null>(null);

  const save = useCallback(
    (next: ReadingDraft) => {
      setDraft(next);
      localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );

  function start() {
    const t = Date.now();
    const saved = parseReadingDraft(localStorage.getItem(key), t);
    const next = saved && secondsLeft(saved.startedAt, t) > 0 ? saved : { startedAt: t, answers: {}, highlights: {} };
    setResumed(next === saved);
    setNow(t);
    save(next);
  }

  const left = draft ? secondsLeft(draft.startedAt, now) : TEST_SECONDS;
  const answers: Answers = draft?.answers ?? {};
  const timeUp = draft !== null && left <= 0;

  const submit = useCallback(async () => {
    if (!draft || submitting) return;
    setConfirming(false);
    setSubmitting(true);
    setError(null);
    const result = await run(() =>
      invokeFunction<GradeTestResponse>(createClient(), "grade-test", {
        body: {
          module: "reading",
          test_id: payload.test.id,
          answers: toGradeAnswers(draft.answers),
          time_taken_sec: Math.min(TEST_SECONDS, Math.round((Date.now() - draft.startedAt) / 1000)),
        },
      }),
    );
    if (result.data) {
      localStorage.removeItem(key);
      router.push(readingAttemptPath(result.data.attempt_id));
      return;
    }
    setSubmitting(false);
    // Allowance refusals open their own dialog (useCredits().run); say something for the rest.
    if (result.error.code !== "allowance_exceeded") setError(`Your answers couldn't be sent: ${result.error.message} They're saved on this device; try again.`);
  }, [draft, key, payload.test.id, router, run, submitting]);

  // The clock. At 0 the answers are sent once, as in the test.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!draft) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft]);
  useEffect(() => {
    if (!timeUp || autoSent.current) return;
    // Marked as sent only when it fires: a re-render that cancels this timer schedules it again.
    const t = setTimeout(() => {
      if (autoSent.current) return;
      autoSent.current = true;
      void submit();
    }, 0);
    return () => clearTimeout(t);
  }, [timeUp, submit]);

  const byPassage = useMemo(() => {
    const map = new Map<string, Question[]>();
    for (const p of passages) map.set(p.id, payload.questions.filter((q) => q.passage_id === p.id));
    return map;
  }, [passages, payload.questions]);
  const passage = passages.find((p) => p.order_no === passageNo) ?? passages[0]!;
  const groups = useMemo(() => questionGroups(byPassage.get(passage.id) ?? []), [byPassage, passage.id]);
  const allNos = payload.questions.map((q) => q.q_no).sort((a, b) => a - b);
  const unanswered = allNos.length - answeredCount(answers, allNos);

  function answer(qNo: number, value: string | string[]) {
    if (!draft || timeUp) return;
    save({ ...draft, answers: setAnswer(draft.answers, qNo, value) });
  }

  function setHighlights(ranges: Range[]) {
    if (!draft) return;
    save({ ...draft, highlights: { ...draft.highlights, [passage.id]: ranges } });
  }

  /** Mobile Passage / Questions switch: come back to where that view was left. */
  function show(next: "passage" | "questions") {
    if (next === pane) return;
    paneScroll.current[pane] = window.scrollY;
    setPane(next);
    requestAnimationFrame(() => {
      const saved = paneScroll.current[next];
      // First visit: the top of the view, just under the pinned switch.
      const top = panesTop.current ? panesTop.current.getBoundingClientRect().top + window.scrollY - 140 : 0;
      window.scrollTo({ top: saved ?? Math.min(window.scrollY, Math.max(0, top)) });
    });
  }

  function jump(qNo: number) {
    setCurrent(qNo);
    const q = payload.questions.find((x) => x.q_no === qNo);
    const p = passages.find((x) => x.id === q?.passage_id);
    if (p) setPassageNo(p.order_no);
    setPane("questions");
    requestAnimationFrame(() => {
      // Keep the current number visible in the navigator (it scrolls sideways on phones).
      navigator.current?.querySelector<HTMLElement>(`[data-n="${qNo}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      const el = questionsPane.current?.querySelector<HTMLElement>(`[data-q="${qNo}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    });
  }

  const backLink = (
    <Link href={routes.reading} className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> Reading tests
    </Link>
  );

  if (!draft) {
    return (
      <div className="flex flex-col gap-4">
        <div className="self-start">{backLink}</div>
        <div className="flex max-w-xl flex-col gap-5 rounded-3xl border border-foreground/5 bg-card p-6 shadow-sm" data-testid="reading-intro">
          <div className="flex flex-col gap-1">
            <h1 className="text-h2">{payload.test.title}</h1>
            <p className="text-sm text-muted-foreground">{testTypeLabel(payload.test.test_type)} Reading</p>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>60 minutes for {passages.length} passages and {allNos.length} questions.</li>
            <li>The clock keeps running if you leave; your answers are sent when it reaches zero.</li>
            <li>Select text in a passage to highlight it.</li>
            <li>Answers are saved on this device as you go.</li>
          </ul>
          <Button size="lg" className="self-start" onClick={start}>
            Start the test
          </Button>
        </div>
      </div>
    );
  }

  const tone = timerTone(left);
  const questionsLeft = (p: (typeof passages)[number]) => {
    const nos = (byPassage.get(p.id) ?? []).map((q) => q.q_no);
    return `${answeredCount(answers, nos)}/${nos.length}`;
  };
  const at = current === null ? -1 : allNos.indexOf(current);
  const step = (by: 1 | -1) => {
    const next = allNos[at === -1 ? 0 : Math.min(allNos.length - 1, Math.max(0, at + by))];
    if (next !== undefined) jump(next);
  };
  const requestSubmit = () => (unanswered > 0 && !timeUp ? setConfirming(true) : void submit());
  /** Typing or choosing in a question makes it the current one. */
  function track(e: React.FocusEvent<HTMLDivElement>) {
    const q = (e.target as HTMLElement).closest<HTMLElement>("[data-q]")?.dataset.q;
    if (q) setCurrent(Number(q));
  }

  return (
    // Desktop: fixed below the 4rem app header; the page doesn't scroll, only the panes do.
    // Mobile: a normal page (the switch and the navigator are pinned).
    <div className="flex flex-col bg-background md:fixed md:inset-x-0 md:top-16 md:bottom-0 md:z-30" data-testid="reading-player">
      <h1 className="sr-only">
        {payload.test.title}, {testTypeLabel(payload.test.test_type)} Reading
      </h1>
      <div className="flex w-full flex-col gap-3 md:mx-auto md:min-h-0 md:max-w-7xl md:flex-1 md:px-6 md:pt-3">
        {/* Top bar: back, timer and submit. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-4">
            {backLink}
            <div
              role="timer"
              aria-label="Time left"
              data-testid="timer"
              data-tone={tone}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 font-semibold tabular-nums",
                tone === "normal" && "bg-secondary",
                tone === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
                tone === "urgent" && "bg-destructive/10 text-destructive",
              )}
            >
              <Clock className="size-4" aria-hidden />
              {clock(left)}
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {tone === "warn" && left > 9 * 60 ? "Ten minutes left." : tone === "urgent" && left > 4 * 60 ? "Five minutes left." : ""}
          </p>
          {resumed && <p className="text-sm text-muted-foreground">Continued where you left off.</p>}
          <Button className="hidden md:inline-flex" onClick={requestSubmit} disabled={submitting}>
            {submitting ? "Marking…" : "Submit answers"}
          </Button>
        </div>
        {timeUp && (
          <p role="status" className="rounded-2xl bg-secondary px-4 py-2 text-sm">
            Time is up. {submitting ? "Sending your answers…" : "Your answers are saved; send them with Submit answers."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {/* Passage tabs. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Passages" className="flex gap-2 overflow-x-auto">
            {passages.map((p) => (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={p.order_no === passage.order_no}
                onClick={() => setPassageNo(p.order_no)}
                className={cn(
                  "flex shrink-0 flex-col items-start rounded-2xl border px-4 py-2 text-left text-sm transition-colors",
                  p.order_no === passage.order_no ? "border-primary bg-primary/10" : "border-foreground/10 hover:border-primary/60",
                )}
              >
                <span className="font-medium">Passage {p.order_no}</span>
                <span className="text-xs text-muted-foreground">{questionsLeft(p)} answered</span>
              </button>
            ))}
          </div>
        </div>
        {/* Mobile: pinned under the header, so the other view is always one tap away. */}
        <div className="sticky top-16 z-20 -mx-1 bg-background/95 px-1 py-2 backdrop-blur md:hidden">
          <div role="group" aria-label="Show" className="grid w-full grid-cols-2 gap-1 rounded-full bg-secondary p-1">
            {(["passage", "questions"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={pane === v}
                onClick={() => show(v)}
                className={cn("rounded-full py-2 text-sm font-medium capitalize", pane === v && "bg-background shadow-sm")}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: the panes take the rest of the height and scroll on their own. */}
        <div ref={panesTop} className="grid md:min-h-0 md:flex-1 md:grid-cols-2 md:gap-8">
          <div
            className={cn("md:block md:h-full md:min-h-0 md:overflow-y-auto md:pr-3", pane === "passage" ? "block" : "hidden")}
            data-testid="passage-pane"
          >
            <PassageView title={passage.title} body={passage.body} highlights={draft.highlights[passage.id] ?? []} onHighlightsChange={setHighlights} />
          </div>
          <div
            ref={questionsPane}
            onFocus={track}
            className={cn("md:block md:h-full md:min-h-0 md:overflow-y-auto md:pr-3", pane === "questions" ? "block" : "hidden")}
            data-testid="questions-pane"
          >
            <fieldset disabled={timeUp} className="flex flex-col gap-10 pb-6">
              {groups.map((g) => (
                <QuestionGroupView key={g.first} group={g} answers={answers} onAnswer={answer} />
              ))}
            </fieldset>
          </div>
        </div>
      </div>

      {/* Navigator, always at the bottom: Previous / every number / Next. */}
      <div className="sticky bottom-0 z-20 -mx-1 border-t border-foreground/5 bg-background/95 backdrop-blur md:static md:mx-0 md:bg-background">
        <div className="flex w-full items-center gap-2 px-1 py-2.5 md:mx-auto md:max-w-7xl md:px-6">
          <Button variant="outline" size="sm" onClick={() => step(-1)} disabled={at <= 0} aria-label="Previous question">
            <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
          </Button>
          <nav ref={navigator} aria-label="Questions" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto p-1">
            {allNos.map((n) => (
              <button
                key={n}
                type="button"
                data-n={n}
                onClick={() => jump(n)}
                aria-label={`Question ${n}${isAnswered(answers[String(n)]) ? ", answered" : ""}`}
                aria-current={current === n ? "step" : undefined}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-medium transition-colors",
                  isAnswered(answers[String(n)]) ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 hover:border-primary",
                  current === n && "ring-2 ring-primary ring-offset-2",
                )}
              >
                {n}
              </button>
            ))}
          </nav>
          {/* Mobile: on the last question, Next becomes Submit (there's no Submit at the top). */}
          {at === allNos.length - 1 && (
            <Button size="sm" className="md:hidden" onClick={requestSubmit} disabled={submitting}>
              {submitting ? "Marking…" : "Submit answers"}
            </Button>
          )}
          <Button
            size="sm"
            className={cn(at === allNos.length - 1 && "hidden md:inline-flex")}
            onClick={() => step(1)}
            disabled={at === allNos.length - 1}
            aria-label="Next question"
          >
            <span className="hidden sm:inline">Next</span> <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit with {unanswered} unanswered?</DialogTitle>
            <DialogDescription>
              Unanswered questions are marked wrong, and this uses one of this month&apos;s Reading tests. You have {clock(left)} left.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Keep going</Button>} />
            <Button onClick={() => void submit()}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
