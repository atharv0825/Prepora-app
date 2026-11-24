"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
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
import { QuestionGroupView } from "@/components/questions/question-group";
import { type Answers, answeredCount, isAnswered, questionGroups, setAnswer, toGradeAnswers } from "@/lib/questions";
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
import { readingAttemptPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";
import { PassageView } from "./passage-view";

type Question = ReadingTestPayload["questions"][number];

/**
 * The Reading test player (M4-F2):
 *   * desktop: the passage and its questions side by side, each scrolling on its own;
 *     mobile: Passage / Questions tabs;
 *   * Passage 1 / 2 / 3 tabs, and a navigator of every question number (answered = filled);
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

  function jump(qNo: number) {
    const q = payload.questions.find((x) => x.q_no === qNo);
    const p = passages.find((x) => x.id === q?.passage_id);
    if (p) setPassageNo(p.order_no);
    setPane("questions");
    requestAnimationFrame(() => {
      const el = questionsPane.current?.querySelector<HTMLElement>(`[data-q="${qNo}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    });
  }

  if (!draft) {
    return (
      <div className="flex max-w-xl flex-col gap-5 rounded-3xl border border-black/5 bg-white p-6 shadow-sm" data-testid="reading-intro">
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
    );
  }

  const tone = timerTone(left);
  const questionsLeft = (p: (typeof passages)[number]) => {
    const nos = (byPassage.get(p.id) ?? []).map((q) => q.q_no);
    return `${answeredCount(answers, nos)}/${nos.length}`;
  };

  return (
    <div className="flex flex-col gap-4" data-testid="reading-player">
      {/* Top bar: timer and submit. */}
      <div className="sticky top-16 z-30 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-background/95 px-1 py-2 backdrop-blur">
        <div
          role="timer"
          aria-label="Time left"
          data-testid="timer"
          data-tone={tone}
          className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 font-semibold tabular-nums",
            tone === "normal" && "bg-secondary",
            tone === "warn" && "bg-amber-100 text-amber-900",
            tone === "urgent" && "bg-destructive/10 text-destructive",
          )}
        >
          <Clock className="size-4" aria-hidden />
          {clock(left)}
        </div>
        <p className="sr-only" aria-live="polite">
          {tone === "warn" && left > 9 * 60 ? "Ten minutes left." : tone === "urgent" && left > 4 * 60 ? "Five minutes left." : ""}
        </p>
        {resumed && <p className="text-sm text-muted-foreground">Continued where you left off.</p>}
        <Button onClick={() => (unanswered > 0 && !timeUp ? setConfirming(true) : void submit())} disabled={submitting}>
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
              p.order_no === passage.order_no ? "border-primary bg-primary/10" : "border-black/10 hover:border-primary/60",
            )}
          >
            <span className="font-medium">Passage {p.order_no}</span>
            <span className="text-xs text-muted-foreground">{questionsLeft(p)} answered</span>
          </button>
        ))}
      </div>

      {/* Mobile: one pane at a time. */}
      <div role="group" aria-label="Show" className="grid grid-cols-2 gap-1 rounded-full bg-secondary p-1 md:hidden">
        {(["passage", "questions"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={pane === v}
            onClick={() => setPane(v)}
            className={cn("rounded-full py-2 text-sm font-medium capitalize", pane === v && "bg-white shadow-sm")}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        <div
          className={cn("md:block md:h-[calc(100dvh-19rem)] md:overflow-y-auto md:pr-3", pane === "passage" ? "block" : "hidden")}
          data-testid="passage-pane"
        >
          <PassageView title={passage.title} body={passage.body} highlights={draft.highlights[passage.id] ?? []} onHighlightsChange={setHighlights} />
        </div>
        <div
          ref={questionsPane}
          className={cn("md:block md:h-[calc(100dvh-19rem)] md:overflow-y-auto md:pr-3", pane === "questions" ? "block" : "hidden")}
          data-testid="questions-pane"
        >
          <fieldset disabled={timeUp} className="flex flex-col gap-10 pb-6">
            {groups.map((g) => (
              <QuestionGroupView key={g.first} group={g} answers={answers} onAnswer={answer} />
            ))}
          </fieldset>
        </div>
      </div>

      {/* Navigator. */}
      <nav aria-label="Questions" className="sticky bottom-0 z-20 -mx-1 flex gap-1.5 overflow-x-auto border-t border-black/5 bg-background/95 px-1 py-3 backdrop-blur">
        {allNos.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => jump(n)}
            aria-label={`Question ${n}${isAnswered(answers[String(n)]) ? ", answered" : ""}`}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full border text-xs font-medium transition-colors",
              isAnswered(answers[String(n)]) ? "border-primary bg-primary text-primary-foreground" : "border-black/15 hover:border-primary",
            )}
          >
            {n}
          </button>
        ))}
      </nav>

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
