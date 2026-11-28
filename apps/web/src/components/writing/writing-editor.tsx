"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Clock, Keyboard, Loader2, X } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import { Textarea } from "@prepora/ui/components/textarea";
import type { OcrWritingResponse } from "@prepora/shared/api/ocr-writing";
import { countEssayWords, WRITING_TASKS, type WritingTaskNo } from "@prepora/shared/ielts/writing";
import type { TestType } from "@prepora/shared/types/profile";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { useCredits } from "@/components/credits/credits-provider";
import { routes, writingSubmissionPath, writingTaskPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { scoreWriting } from "@/lib/writing/api";
import {
  EMPTY_DRAFT,
  parseWritingDraft,
  taskKindLabel,
  taskSeconds,
  timeLeft,
  type WritingDraft,
  writingClock,
  writingDraftKey,
  writingTimerTone,
} from "@/lib/writing/writing";
import { PhoneQr } from "./phone-qr";
import { PhotoFlow } from "./photo-flow";
import "./writing-editor.css";

export type EditorTask = {
  id: string;
  task_no: WritingTaskNo;
  test_type: TestType | null;
  title: string;
  prompt: string;
  image_url: string | null;
  /** The visual's description for screen readers (M6-A1). */
  image_alt: string | null;
};

const CREDIT_REFUSALS = ["insufficient_credits", "daily_cap_reached", "feature_not_in_plan"];
const SCORING_STEPS = ["Reading your answer", "Checking the four criteria", "Finding corrections", "Writing your feedback"];

/**
 * M6-F1..F3: the Writing editor. The task and its chart; type the answer (live word count, the
 * exam timer: 20 min for Task 1, 40 for Task 2, starting with the first word, or with "Start timer"
 * when writing on paper; "Reset timer" sets it back) or upload a photo of
 * handwriting (M6-F2); everything autosaves on this device. "Get my band score" confirms the
 * credits, shows progress while score-writing runs, then opens the feedback. The timer never sends
 * the answer by itself: scoring costs credits, so only the student starts it.
 */
export function WritingEditor({ task, userId, openPhoto }: { task: EditorTask; userId: string; openPhoto: boolean }) {
  const router = useRouter();
  const { run } = useCredits();
  const key = writingDraftKey(task.id);
  const limit = taskSeconds(task.task_no);
  const { minWords, actionKey } = WRITING_TASKS[task.task_no];

  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [restored, setRestored] = useState(false);
  const [tab, setTab] = useState<"type" | "photo">(openPhoto ? "photo" : "type");
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [scoring, setScoring] = useState<number | null>(null); // when scoring started
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false); // the chart, opened larger over the task column

  // Escape closes the larger chart.
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the draft saved on this device (client only: localStorage).
  useEffect(() => {
    const saved = parseWritingDraft(localStorage.getItem(key));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage after mount
    setDraft(saved ?? EMPTY_DRAFT);
    setRestored(Boolean(saved?.text.trim()));
  }, [key]);

  const persist = useCallback(
    (next: WritingDraft, immediate = false) => {
      setDraft(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const write = () => {
        localStorage.setItem(key, JSON.stringify(next));
        setSavedAt(Date.now());
      };
      if (immediate) write();
      else saveTimer.current = setTimeout(write, 400);
    },
    [key],
  );
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  // The clock ticks once the first word is written.
  const started = draft?.startedAt ?? null;
  useEffect(() => {
    if (started === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [started]);

  function onType(text: string) {
    if (!draft) return;
    const startedAt = draft.startedAt ?? (text.trim() ? Date.now() : null);
    if (startedAt !== draft.startedAt) setNow(Date.now());
    persist({ ...draft, text, startedAt });
  }

  /** Writing on paper: start the clock without typing. */
  function startTimer() {
    if (!draft) return;
    const at = Date.now();
    setNow(at);
    persist({ ...draft, startedAt: at }, true);
  }

  /** Back to the full time; only the timer, the answer stays. Typing starts it again. */
  function resetTimer() {
    if (!draft) return;
    persist({ ...draft, startedAt: null }, true);
  }

  function onRead(result: OcrWritingResponse) {
    if (!draft) return;
    persist({ ...draft, text: result.text, mode: "photo", photoPaths: result.pages.map((p) => p.path), startedAt: draft.startedAt ?? Date.now() }, true);
    const unsure = result.pages.some((p) => p.legibility !== "good");
    setOcrNote(
      result.pages.some((p) => p.legibility === "unreadable")
        ? "We couldn't read some of your photos. Check the text below, or retake the photos."
        : unsure
        ? "Text read from your photos. Check it carefully, especially words marked [?], then get your score."
        : "Text read from your photos. Check it matches what you wrote, then get your score.",
    );
    setTab("type");
  }

  function switchToTyping() {
    if (!draft) return;
    persist({ ...draft, mode: "typed", photoPaths: [] }, true);
    setOcrNote(null);
  }

  const submit = useCallback(async () => {
    if (!draft || scoring !== null) return;
    setScoring(Date.now());
    setError(null);
    const supabase = createClient();
    const result = await run(() =>
      scoreWriting(supabase, {
        task_id: task.id,
        text: draft.text,
        input_mode: draft.mode,
        ...(draft.mode === "photo" ? { photo_paths: draft.photoPaths } : {}),
        ...(draft.startedAt ? { time_taken_sec: Math.min(86_400, Math.round((Date.now() - draft.startedAt) / 1000)) } : {}),
      }),
    );
    if (result.data) {
      localStorage.removeItem(key);
      router.push(writingSubmissionPath(result.data.submission_id));
      return;
    }
    setScoring(null);
    if (!CREDIT_REFUSALS.includes(result.error.code)) {
      setError(`Your answer couldn't be scored: ${result.error.message} It's saved on this device, and no credits were kept; try again.`);
    }
  }, [draft, key, router, run, scoring, task.id]);

  const words = countEssayWords(draft?.text ?? "");
  const left = started !== null ? timeLeft(started, now, limit) : limit;
  const tone = writingTimerTone(left);
  const under = words < minWords;

  return (
    <div className="we-page mx-auto flex w-full max-w-7xl flex-col gap-6 pb-32">
      <BackLink />
      <div className="flex flex-col gap-3">
        <div>
          <Badge variant="secondary">{taskKindLabel(task.task_no, task.test_type)}</Badge>
        </div>
        <h1 className="text-h1">{task.title}</h1>
      </div>

      {/* Wide screens: the task and the answer side by side, each with its own scroll, both sized to fit
          between the header and the bottom bar; the task stays in view while writing. */}
      <div className="grid gap-6 we-columns">
      <div className="relative min-w-0 we-pane">
      <section
        className="we-taskScroll flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-5 sm:p-6"
        aria-label="The task"
      >
        <p className="whitespace-pre-line leading-relaxed" data-testid="task-prompt">
          {task.prompt}
        </p>
        {task.image_url && (
          <figure className="shrink-0 overflow-hidden rounded-2xl border border-foreground/10 bg-white">
            {/* Click to open it larger, over the task column only. */}
            <button type="button" onClick={() => setZoom(true)} className="block w-full cursor-zoom-in" aria-label="Open the chart larger" data-testid="chart-open">
              {/* Plain <img>: CDN images, sized by the container; optimisation is off app-wide. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={task.image_url} alt={task.image_alt || "The chart, graph, table or diagram for this task"} className="block h-auto w-full" />
            </button>
          </figure>
        )}
        <p className="text-sm text-muted-foreground">
          Spend about {WRITING_TASKS[task.task_no].minutes} minutes. Write at least {minWords} words.
        </p>
      </section>
      {zoom && task.image_url && (
        <div className="we-zoom" role="dialog" aria-label="The chart, larger" data-testid="chart-zoom">
          <div className="we-zoomBar">
            <Button variant="outline" size="sm" onClick={() => setZoom(false)} autoFocus>
              <X className="size-4" aria-hidden /> Close
            </Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={task.image_url} alt={task.image_alt || "The chart, graph, table or diagram for this task"} className="we-zoomImg" />
        </div>
      )}
      </div>

      <div className="we-pane we-answerScroll flex min-w-0 flex-col gap-4">
      {scoring !== null ? (
        <ScoringProgress started={scoring} />
      ) : (
        <>
          <div role="tablist" aria-label="How to answer" className="flex gap-2">
            <TabButton active={tab === "type"} onClick={() => setTab("type")} icon={<Keyboard />} label="Type your answer" />
            <TabButton active={tab === "photo"} onClick={() => setTab("photo")} icon={<Camera />} label="Upload a photo" />
          </div>

          {tab === "photo" ? (
            <div className="flex flex-col gap-5" role="tabpanel" aria-label="Upload a photo">
              <PhotoFlow taskId={task.id} userId={userId} onRead={onRead} />
              <PhoneQr path={writingTaskPath(task.id, { photo: true })} />
            </div>
          ) : (
            <div className="we-answerPanel flex flex-col gap-3" role="tabpanel" aria-label="Type your answer">
              {restored && <p className="text-sm text-muted-foreground">Your draft from this device is back.</p>}
              {ocrNote && (
                <div className="flex flex-col gap-2 rounded-2xl bg-secondary p-4 text-sm sm:flex-row sm:items-center sm:justify-between" role="status">
                  <span>{ocrNote}</span>
                  <Button variant="outline" size="sm" onClick={switchToTyping}>
                    I&apos;ll type it instead
                  </Button>
                </div>
              )}
              <Textarea
                aria-label="Your answer"
                placeholder="Start writing: the timer starts with your first word."
                value={draft?.text ?? ""}
                onChange={(e) => onType(e.target.value)}
                disabled={!draft}
                maxLength={20_000}
                // No spell check, as in the exam.
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="sentences"
                className="we-answerBox min-h-[50vh] text-base"
                data-testid="answer"
              />
            </div>
          )}
        </>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      </div>
      </div>

      {/* The bar stays on screen: words, timer, saved, and the score button. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-foreground/10 bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <span data-testid="word-count" className={cn("tabular-nums", under ? "text-muted-foreground" : "font-medium")}>
              {words} {words === 1 ? "word" : "words"}
              <span className="text-muted-foreground"> / {minWords}+</span>
            </span>
            <span
              data-testid="timer"
              aria-label={started === null ? "Timer not started" : left < 0 ? `Over time by ${writingClock(left).slice(1)}` : `${writingClock(left)} left`}
              className={cn(
                "flex items-center gap-1 tabular-nums",
                tone === "warn" && "font-medium text-amber-700 dark:text-amber-400",
                tone === "over" && "font-medium text-destructive",
              )}
            >
              <Clock className="size-4" aria-hidden />
              {writingClock(left)}
            </span>
            {scoring === null &&
              (started === null ? (
                <Button variant="outline" size="sm" onClick={startTimer} disabled={!draft} data-testid="start-timer">
                  Start timer
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={resetTimer} data-testid="reset-timer">
                  Reset timer
                </Button>
              ))}
            {savedAt && (
              <span className="hidden items-center gap-1 text-muted-foreground sm:flex" data-testid="saved">
                <Check className="size-4" aria-hidden /> Saved
              </span>
            )}
          </div>
          <CostConfirm
            actionKey={actionKey}
            description={
              under
                ? `Your answer has ${words} words, under the ${minWords}-word minimum: that lowers the score. Score it anyway?`
                : `Band per criterion, corrections and a model answer for this Task ${task.task_no} answer.`
            }
            confirmLabel="Score my answer"
            onConfirm={() => void submit()}
            disabled={!draft?.text.trim() || scoring !== null}
            trigger={<Button disabled={!draft?.text.trim() || scoring !== null}>Get my band score</Button>}
          />
        </div>
        {left < 0 && scoring === null && (
          <p className="mx-auto w-full max-w-7xl px-4 pb-3 text-sm text-destructive" role="status">
            Time&apos;s up: in the exam you&apos;d stop here. You can still finish and get your score.
          </p>
        )}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href={routes.writing} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> All Writing tasks
    </Link>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors [&_svg]:size-4",
        active ? "border-primary bg-primary text-primary-foreground" : "border-foreground/15 hover:border-primary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** While score-writing runs (usually 15–60 s): what's happening, and that leaving is safe. */
function ScoringProgress({ started }: { started: number }) {
  const [now, setNow] = useState(started);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const step = Math.min(SCORING_STEPS.length - 1, Math.floor(seconds / 8));
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl bg-secondary p-10 text-center" role="status" aria-live="polite" data-testid="scoring-progress">
      <Loader2 className="size-8 animate-spin" aria-hidden />
      <p className="text-h3">{SCORING_STEPS[step]}…</p>
      <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
        {SCORING_STEPS.map((s, i) => (
          <li key={s} className={cn(i < step && "line-through", i === step && "font-medium text-foreground")}>
            {s}
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted-foreground">
        This usually takes under a minute ({seconds}s so far). If you leave, your feedback will still be in your Writing history.
      </p>
    </section>
  );
}
