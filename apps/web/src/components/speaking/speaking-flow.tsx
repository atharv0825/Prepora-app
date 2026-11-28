"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mic, RotateCcw, Square, TriangleAlert, Upload } from "lucide-react";
import { cn } from "cn";
import { Button } from "@prepora/ui/components/button";
import { Textarea } from "@prepora/ui/components/textarea";
import type { ScoreSpeakingResponse } from "@prepora/shared/api/score-speaking";
import { PART2_MIN_SECONDS, SPEAKING_PARTS } from "@prepora/shared/ielts/speaking";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { useCredits } from "@/components/credits/credits-provider";
import { speakingResponsePath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { scoreSpeaking } from "@/lib/speaking/api";
import { clearPending, loadPending, type PendingRecording, savePending } from "@/lib/speaking/pending";
import { mmss, pickRecorderType, uploadTypeFor } from "@/lib/speaking/speaking";
import { UploadError, uploadWithRetry } from "@/lib/speaking/upload";
import { CueCardLayout, CueCardReveal } from "./cue-card-reveal";
import { MicCheck } from "./mic-check";

export type CueCardTopic = { id: string; title: string; points: string[] };

const { prepSeconds: PREP, maxSeconds: MAX } = SPEAKING_PARTS[2];
const CREDIT_REFUSALS = ["insufficient_credits", "daily_cap_reached", "feature_not_in_plan"];
const SCORING_STEPS = ["Listening to your answer", "Measuring fluency and pauses", "Checking the four criteria", "Writing your feedback"];

type Recording = { blob: Blob; url: string; recorderType: string | null; seconds: number };
type Phase = "pending" | "mic" | "card" | "prep" | "recording" | "review" | "sending";

/**
 * M7-F2/F3: a Part 2 cue card, as in the exam: the card → 1 minute to prepare (with a notes box) →
 * speak for up to 2 minutes (the recorder stops at 2:00) → listen back, re-record if you like →
 * "Get my band score" (credit confirm) → upload with progress and retries → scoring progress →
 * the feedback page. The recording stays on this device until it's scored (pending.ts), so a
 * failed upload or a closed tab can be retried without recording again.
 *
 * Inside the full test (M8-F2) it gets the test's `session`, the microphone `stream` (owned by the
 * full test, so it isn't stopped here) and `onScored` instead of the feedback page. The credits
 * were confirmed when the test started, and the recording isn't kept on the device (a retry works
 * while the page is open).
 */
export function SpeakingFlow({
  topic,
  userId,
  session,
  stream: sharedStream,
  onScored,
}: {
  topic: CueCardTopic;
  userId: string;
  session?: { id: string };
  stream?: MediaStream;
  onScored?: (result: ScoreSpeakingResponse) => void;
}) {
  const router = useRouter();
  const { run } = useCredits();
  const [phase, setPhase] = useState<Phase | null>(session ? (sharedStream ? "card" : "mic") : null);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [notes, setNotes] = useState("");
  const [left, setLeft] = useState(PREP);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [progress, setProgress] = useState<{ stage: "upload" | "score"; fraction: number; started: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false); // the cue card has landed face up
  const stream = useRef<MediaStream | null>(sharedStream ?? null);
  const recorder = useRef<MediaRecorder | null>(null);
  const inTest = Boolean(session);
  // Outside a full test the recording is kept on the device until scored.
  const store = {
    save: (r: PendingRecording) => (inTest ? Promise.resolve() : savePending(r)),
    clear: () => (inTest ? Promise.resolve() : clearPending(topic.id)),
  };

  // An unsent recording from before?
  useEffect(() => {
    if (inTest) return;
    let live = true;
    void loadPending(topic.id).then((p) => {
      if (!live) return;
      setPending(p);
      setPhase(p ? "pending" : "mic");
    });
    return () => {
      live = false;
    };
  }, [topic.id, inTest]);

  // Release the microphone when leaving (unless the full test owns it).
  useEffect(() => () => {
    if (!sharedStream) stream.current?.getTracks().forEach((t) => t.stop());
  }, [sharedStream]);

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  // Prep countdown → recording starts by itself at 0, as in the exam.
  useEffect(() => {
    if (phase !== "prep") return;
    const started = Date.now();
    const t = setInterval(() => {
      const l = Math.max(0, PREP - Math.floor((Date.now() - started) / 1000));
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        startRecording();
      }
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  // Recording clock; stops at 2:00.
  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= MAX) stopRecording();
    }, 250);
    return () => clearInterval(t);
  }, [phase, stopRecording]);

  function startRecording() {
    if (!stream.current) return;
    const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
    const rec = type ? new MediaRecorder(stream.current, { mimeType: type }) : new MediaRecorder(stream.current);
    const chunks: Blob[] = [];
    const started = Date.now();
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      const recorderType = rec.mimeType || type;
      const blob = new Blob(chunks, { type: recorderType ?? "audio/webm" });
      const seconds = Math.min(MAX, Math.round((Date.now() - started) / 1000));
      setRecording((old) => {
        if (old) URL.revokeObjectURL(old.url);
        return { blob, url: URL.createObjectURL(blob), recorderType, seconds };
      });
      setPhase("review");
    };
    rec.start(1000);
    recorder.current = rec;
    setElapsed(0);
    setPhase("recording");
  }

  async function send(rec: PendingRecording) {
    setError(null);
    setPhase("sending");
    const supabase = createClient();
    try {
      await store.save(rec);
      // 1. The session (once; reused by a retry). In a full test, the test's.
      let sessionId = rec.sessionId ?? session?.id;
      if (!sessionId) {
        sessionId = crypto.randomUUID();
        const { error: e } = await supabase.from("speaking_sessions").insert({ id: sessionId, user_id: userId, mode: "part2" });
        if (e) throw new Error(`We couldn't start your session (${e.message}).`);
        rec = { ...rec, sessionId };
        await store.save(rec);
      }
      // 2. The recording, with progress (once; reused by a retry).
      const { contentType, ext } = uploadTypeFor(rec.recorderType);
      let audioPath = rec.audioPath;
      if (!audioPath) {
        audioPath = `${userId}/${sessionId}.${ext}`;
        const { data } = await supabase.auth.getSession();
        const { url, publishableKey } = getSupabaseEnv();
        setProgress({ stage: "upload", fraction: 0, started: Date.now() });
        await uploadWithRetry({
          url,
          publishableKey,
          accessToken: data.session?.access_token ?? "",
          bucket: "speaking-audio",
          path: audioPath,
          blob: rec.blob,
          contentType,
          onProgress: (fraction) => setProgress((p) => (p ? { ...p, fraction } : p)),
        });
        rec = { ...rec, audioPath };
        await store.save(rec);
      }
      // 3. Scoring.
      setProgress({ stage: "score", fraction: 0, started: Date.now() });
      const result = await run(() =>
        scoreSpeaking(supabase, { session_id: sessionId, topic_id: topic.id, part: 2, audio_path: audioPath, duration_sec: Math.max(1, rec.durationSec) }),
      );
      if (result.data) {
        await store.clear();
        if (onScored) onScored(result.data);
        else router.push(speakingResponsePath(result.data.response_id));
        return;
      }
      setProgress(null);
      setPending(rec);
      if (result.error.code === "conflict" && !inTest) {
        // The session is finished or this part already scored: a retry starts a new session.
        const fresh = { ...rec, sessionId: undefined, audioPath: undefined };
        await store.save(fresh);
        setPending(fresh);
      }
      if (!CREDIT_REFUSALS.includes(result.error.code)) {
        setError(`Your answer couldn't be scored: ${result.error.message} Your recording is saved on this device, and no credits were kept; try again.`);
      }
      setPhase("review");
    } catch (err) {
      setProgress(null);
      setPending(rec);
      const msg = err instanceof UploadError ? `The upload failed: ${err.message}.` : err instanceof Error ? err.message : "Something went wrong.";
      setError(`${msg} Your recording is saved on this device; try again when your connection is back.`);
      setPhase("review");
    }
  }

  function submitCurrent() {
    const base = pending && recording === null ? pending : null;
    if (base) return void send(base);
    if (!recording) return;
    void send({ topicId: topic.id, blob: recording.blob, recorderType: recording.recorderType, durationSec: recording.seconds, savedAt: Date.now() });
  }

  async function discardPending() {
    await clearPending(topic.id);
    setPending(null);
    setPhase("mic");
  }

  if (phase === null) return <p className="text-muted-foreground">Loading…</p>;

  // The cue card as a real card, revealed with a toss when it first shows (CueCardReveal). Once
  // it has landed it moves to the left and the steps (start, prepare, record) appear beside it.
  const card = <CueCardReveal title={topic.title} points={topic.points} onRevealed={() => setRevealed(true)} />;

  const reviewTarget = recording ?? (pending ? { url: "", seconds: pending.durationSec } : null);

  return (
    <div className="flex flex-col gap-6">
      {phase === "pending" && pending && (
        <section className="flex flex-col gap-3 rounded-3xl border border-foreground/10 bg-card p-6" aria-label="Unsent recording" data-testid="pending-recording">
          <h2 className="text-h3">You have a recording that wasn&apos;t scored</h2>
          <p className="text-sm text-muted-foreground">
            {mmss(pending.durationSec)} recorded on this device. Send it now, or record a new answer.
          </p>
          <div className="flex flex-wrap gap-3">
            <CostConfirm
              actionKey={SPEAKING_PARTS[2].actionKey}
              description="Band per criterion, your transcript, better phrases and a model answer for this cue card."
              confirmLabel="Score my answer"
              onConfirm={() => void send(pending)}
              trigger={<Button>Send it</Button>}
            />
            <Button variant="outline" onClick={() => void discardPending()}>
              Record a new answer
            </Button>
          </div>
        </section>
      )}

      {phase === "mic" && (
        <MicCheck
          onReady={(s) => {
            stream.current = s;
            setPhase("card");
          }}
        />
      )}

      {(phase === "card" || phase === "prep" || phase === "recording") && (
        <CueCardLayout split={revealed} card={card}>
      {phase === "card" && (
        <section className="flex flex-col gap-3" aria-label="Before you start">
          <p className="text-sm text-muted-foreground">
            You&apos;ll have 1 minute to prepare, then speak for 1 to 2 minutes. Recording starts by itself when preparation ends.
          </p>
          <Button onClick={() => setPhase("prep")} className="self-start">
            Start my 1 minute
          </Button>
        </section>
      )}

      {phase === "prep" && (
        <section className="flex flex-col gap-3" aria-label="Preparation">
          <p className="flex items-center gap-3 text-h3 tabular-nums" aria-live="polite" data-testid="prep-timer">
            Prepare: {mmss(left)}
          </p>
          <Textarea
            aria-label="Notes"
            placeholder="Jot down a few words for each point (only you see these)."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-32"
          />
          <Button variant="outline" onClick={() => startRecording()} className="self-start">
            <Mic /> Start speaking now
          </Button>
        </section>
      )}

      {phase === "recording" && (
        <section className="flex flex-col items-start gap-3 rounded-3xl bg-secondary p-6" aria-label="Recording" data-testid="recording">
          <p className="flex items-center gap-3 text-h3 tabular-nums" aria-live="off">
            <span className="size-3 animate-pulse rounded-full bg-destructive" aria-hidden /> Recording {mmss(elapsed)} / {mmss(MAX)}
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", elapsed < PART2_MIN_SECONDS ? "bg-amber-500" : "bg-primary")} style={{ width: `${(elapsed / MAX) * 100}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {elapsed < PART2_MIN_SECONDS ? "Keep going: aim for at least 1 minute." : "Good. You can stop any time; it stops at 2:00."}
          </p>
          {notes && <p className="w-full whitespace-pre-line rounded-2xl bg-card p-3 text-sm text-muted-foreground">{notes}</p>}
          <Button variant="outline" onClick={stopRecording}>
            <Square /> Stop
          </Button>
        </section>
      )}
        </CueCardLayout>
      )}

      {phase === "review" && reviewTarget && (
        <section className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6" aria-label="Your recording" data-testid="review">
          <h2 className="text-h3">Listen back</h2>
          {recording && (
            <audio controls src={recording.url} className="w-full" data-testid="playback" />
          )}
          <p className="text-sm text-muted-foreground" data-testid="recorded-length">
            {mmss(reviewTarget.seconds)} recorded.
          </p>
          {reviewTarget.seconds < PART2_MIN_SECONDS && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400" role="status">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> Under a minute: in the exam this is a short answer, and it lowers your Fluency score.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {inTest ? (
              <Button onClick={submitCurrent}>{error ? "Try again" : "Send and continue to Part 3"}</Button>
            ) : (
              <CostConfirm
                actionKey={SPEAKING_PARTS[2].actionKey}
                description="Band per criterion, your transcript, better phrases and a model answer for this cue card."
                confirmLabel="Score my answer"
                onConfirm={submitCurrent}
                trigger={<Button>{error ? "Try again" : "Get my band score"}</Button>}
              />
            )}
            {stream.current && (
              <Button
                variant="outline"
                onClick={() => {
                  setError(null);
                  startRecording();
                }}
              >
                <RotateCcw /> Record again
              </Button>
            )}
          </div>
        </section>
      )}

      {phase === "sending" && progress && <SendingProgress stage={progress.stage} fraction={progress.fraction} started={progress.started} />}
      {phase === "sending" && !progress && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Getting ready…
        </p>
      )}
    </div>
  );
}

function SendingProgress({ stage, fraction, started }: { stage: "upload" | "score"; fraction: number; started: number }) {
  const [now, setNow] = useState(started);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const step = Math.min(SCORING_STEPS.length - 1, Math.floor(seconds / 6));
  return (
    <section className="flex flex-col items-center gap-4 rounded-3xl bg-secondary p-10 text-center" role="status" aria-live="polite" data-testid="sending">
      {stage === "upload" ? (
        <>
          <Upload className="size-8" aria-hidden />
          <p className="text-h3">Uploading your recording… {Math.round(fraction * 100)}%</p>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Upload" aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(fraction * 100)}%` }} />
          </div>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="text-h3">{SCORING_STEPS[step]}…</p>
          <p className="text-sm text-muted-foreground">This usually takes under a minute ({seconds}s so far). If you leave, your feedback will still be in your history.</p>
        </>
      )}
    </section>
  );
}
