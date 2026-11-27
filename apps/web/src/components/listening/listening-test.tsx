"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Headphones, Repeat } from "lucide-react";
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
import type { ListeningMode, ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { type Answers, draftKey, type ListeningResultsData, parseDraft, setAnswer, toGradeAnswers } from "@/lib/listening/answers";
import { formatTime } from "@/lib/listening/player";
import { AnswerSheet } from "./answer-sheet";
import { AudioPlayer, type PlayerProgress } from "./audio-player";
import { ListeningResults } from "./listening-results";

export type GradeListening = (input: {
  mode: ListeningMode;
  answers: Answers;
  time_taken_sec: number;
}) => Promise<{ data: ListeningResultsData; error: null } | { data: null; error: string }>;

/** After the recording ends in exam mode: time to check answers before they're sent (as on test day). */
export const EXAM_CHECK_SEC = 120;

/**
 * A Listening test from start to results: choose exam or practice mode → recording + answer
 * sheet → submit → results with transcripts. Answers are saved in this browser as they're
 * typed, so a reload doesn't lose them; they're cleared once the test is graded.
 */
export function ListeningTest({ payload, grade }: { payload: ListeningTestPayload; grade: GradeListening }) {
  const [mode, setMode] = useState<ListeningMode | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [part, setPart] = useState(1);
  const [results, setResults] = useState<ListeningResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [checkLeft, setCheckLeft] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(0);
  const lastPlayed = useRef(0);

  function answer(qNo: number, value: string | string[]) {
    setAnswers((prev) => {
      const next = setAnswer(prev, qNo, value);
      if (mode) localStorage.setItem(draftKey(payload.test.id, mode), JSON.stringify(next));
      return next;
    });
  }

  const submit = useCallback(() => {
    if (!mode) return;
    setConfirming(false);
    setError(null);
    startTransition(async () => {
      const res = await grade({
        mode,
        answers: toGradeAnswers(answers),
        time_taken_sec: Math.round((Date.now() - startedAt.current) / 1000),
      });
      if (res.error !== null) {
        setError(res.error);
        setCheckLeft(null); // stop the automatic send; the student submits again by hand
        return;
      }
      localStorage.removeItem(draftKey(payload.test.id, mode));
      setCheckLeft(null);
      setResults(res.data);
      window.scrollTo({ top: 0 });
    });
  }, [answers, grade, mode, payload.test.id]);

  // Follow the recording: the sheet shows the part being played; exam mode starts the checking
  // time when the last part ends.
  const onProgress = useCallback(
    ({ section, statuses }: PlayerProgress) => {
      if (section !== lastPlayed.current && statuses[section] === "playing") {
        lastPlayed.current = section;
        setPart(section);
      }
      if (mode === "exam" && payload.sections.every((s) => statuses[s.order_no] === "ended")) {
        setCheckLeft((c) => c ?? EXAM_CHECK_SEC);
      }
    },
    [mode, payload.sections],
  );

  useEffect(() => {
    if (checkLeft === null || results || pending) return;
    const t = setTimeout(() => (checkLeft <= 1 ? submit() : setCheckLeft(checkLeft - 1)), 1000);
    return () => clearTimeout(t);
  }, [checkLeft, pending, results, submit]);

  function begin(m: ListeningMode) {
    startedAt.current = Date.now();
    lastPlayed.current = 0;
    setPart(1);
    // Answers saved in this browser from an unfinished go in the same mode.
    setAnswers(parseDraft(localStorage.getItem(draftKey(payload.test.id, m))));
    setMode(m);
  }

  function restart() {
    setResults(null);
    setMode(null);
    setAnswers({});
    setCheckLeft(null);
  }

  if (results) return <ListeningResults data={results} onRetry={restart} />;

  if (!mode) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" data-testid="mode-choice">
        <ModeCard
          icon={<Headphones />}
          title="Exam mode"
          body="Like test day: each part plays once, with no pausing or rewinding. Then two minutes to check your answers. Gives the most realistic band."
          action="Start in exam mode"
          onClick={() => begin("exam")}
        />
        <ModeCard
          icon={<Repeat />}
          title="Practice mode"
          body="Pause, rewind, replay and jump between parts as often as you like. Good for learning; the band will read high."
          action="Start in practice mode"
          onClick={() => begin("practice")}
          outline
        />
      </div>
    );
  }

  const unanswered = payload.questions.filter((q) => !(String(q.q_no) in toGradeAnswers(answers))).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-16 z-30 -mx-1 bg-background/90 px-1 pt-2 pb-1 backdrop-blur">
        <AudioPlayer sections={payload.sections} mode={mode} onProgress={onProgress} />
        {checkLeft !== null && (
          <p className="mt-2 rounded-2xl bg-secondary px-4 py-2 text-sm" role="status" data-testid="check-time">
            The recording has finished. Check your answers: they&apos;re sent in {formatTime(checkLeft)}.
          </p>
        )}
      </div>

      <AnswerSheet questions={payload.questions} answers={answers} onAnswer={answer} part={part} onPartChange={setPart} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end border-t border-foreground/5 pt-6">
        <Button size="lg" onClick={() => (unanswered > 0 ? setConfirming(true) : submit())} disabled={pending}>
          {pending ? "Marking…" : "Submit answers"}
        </Button>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit with {unanswered} unanswered?</DialogTitle>
            <DialogDescription>Unanswered questions are marked wrong. You can&apos;t change your answers after submitting.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Keep going</Button>} />
            <Button onClick={submit}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModeCard({
  icon,
  title,
  body,
  action,
  onClick,
  outline,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: string;
  onClick: () => void;
  outline?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6 shadow-sm">
      <span className="grid size-11 place-items-center rounded-2xl bg-secondary [&_svg]:size-5">{icon}</span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h3">{title}</h2>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <Button className="mt-auto self-start" variant={outline ? "outline" : "default"} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}
