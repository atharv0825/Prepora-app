"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Square, Undo2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import type { ScoreSpeakingResponse } from "@prepora/shared/api/score-speaking";
import { QUESTIONS_PER_PART } from "@prepora/shared/ielts/speaking-session";
import { useCredits } from "@/components/credits/credits-provider";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { examinerTurn, scoreSpeaking } from "@/lib/speaking/api";
import { answerPath, type ExaminerQA, examinerTurns, MAX_ANSWER_SECONDS, pickExaminerVoice, scoreAnswers, TTS_FALLBACK_MS } from "@/lib/speaking/examiner";
import { mmss, pickRecorderType, uploadTypeFor } from "@/lib/speaking/speaking";
import { UploadError, uploadWithRetry } from "@/lib/speaking/upload";

const CREDIT_REFUSALS = ["insufficient_credits", "daily_cap_reached", "feature_not_in_plan"];

type Clip = { blob: Blob; recorderType: string | null; seconds: number };
type Phase = "asking" | "reading" | "recording" | "sending" | "scoring" | "error";
/** What a "Try again" repeats after an error. */
type Retry = { kind: "send"; clip: Clip } | { kind: "turn" } | { kind: "score" };
/**
 * exam      like test day: recording starts as soon as the examiner stops talking; the question
 *           can be heard again only before answering.
 * practice  the student starts answering when ready; "Hear it again" and "Stop" stay available the
 *           whole time (the recording pauses while the examiner talks), and an answer can be redone.
 */
export type SpeakingMode = "exam" | "practice";

/**
 * M8-F1: the AI examiner for one Part 1 or Part 3 (practice or inside the full test). The examiner
 * asks a question: it's shown as text and read aloud by the browser's own voice (a British voice,
 * else an Australian one, when the device has it) → the student answers (exam: recording starts
 * when it stops talking) → "Done" (or the part's limit) uploads the answer to examiner-turn, which
 * transcribes it and picks the next question (4–5 in all) → when the examiner is done, the part is
 * scored (score-speaking, charging its credits) and `onScored` runs.
 * The microphone stream belongs to the parent: this never stops it.
 */
export function ExaminerPart({
  sessionId,
  part,
  topic,
  userId,
  stream,
  mode = "exam",
  onScored,
}: {
  sessionId: string;
  part: 1 | 3;
  topic: { id: string; title: string };
  userId: string;
  stream: MediaStream;
  mode?: SpeakingMode;
  onScored: (result: ScoreSpeakingResponse) => void;
}) {
  const { run } = useCredits();
  const practice = mode === "practice";
  const [phase, setPhase] = useState<Phase>("asking");
  const [question, setQuestion] = useState<{ text: string; no: number } | null>(null);
  const [answered, setAnswered] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [talking, setTalking] = useState(false); // the examiner's voice is playing
  const [error, setError] = useState<{ message: string; retry: Retry | null } | null>(null);
  const qa = useRef<ExaminerQA[]>([]);
  // Refs, so the recorder's and the turns' callbacks always see the current ones.
  const asked = useRef<{ text: string; no: number } | null>(null);
  const scored = useRef(onScored);
  useEffect(() => {
    scored.current = onScored;
  }, [onScored]);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(false);
  const live = useRef(true);
  const redo = useRef(false); // the recorder was stopped to record the answer again
  // Each reading gets a number; cancelling one for good bumps it, so its end event is ignored.
  const voiceRun = useRef(0);
  const voiceDone = useRef<(() => void) | null>(null);
  // Answer time, without the pauses: what has run before + since when it is running now.
  const runMs = useRef(0);
  const runningSince = useRef<number | null>(null);
  const max = MAX_ANSWER_SECONDS[part];
  const tts = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

  const answerMs = () => runMs.current + (runningSince.current === null ? 0 : Date.now() - runningSince.current);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      tts?.cancel();
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
    };
  }, [tts]);

  const fail = useCallback((message: string, retry: Retry | null) => {
    if (!live.current) return;
    setError({ message, retry });
    setPhase("error");
  }, []);

  const startRecording = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") return;
    voiceRun.current++;
    tts?.cancel();
    setTalking(false);
    const type = pickRecorderType((t) => MediaRecorder.isTypeSupported(t));
    const rec = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      recorder.current = null;
      if (redo.current) {
        // "Record again": drop this take and start a new one.
        redo.current = false;
        startRecording();
        return;
      }
      const recorderType = rec.mimeType || type;
      const seconds = Math.min(max, Math.round(answerMs() / 1000));
      runningSince.current = null;
      void send({ blob: new Blob(chunks, { type: recorderType ?? "audio/webm" }), recorderType, seconds });
    };
    rec.start(1000);
    recorder.current = rec;
    runMs.current = 0;
    runningSince.current = Date.now();
    setElapsed(0);
    setPhase("recording");
    // `send` is stable enough: it reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, max, tts]);

  const stopRecording = useCallback(() => {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return;
    voiceRun.current++;
    tts?.cancel();
    setTalking(false);
    if (rec.state === "paused") rec.resume();
    rec.stop();
  }, [tts]);

  function redoAnswer() {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return;
    silence();
    redo.current = true;
    rec.stop();
  }

  /** Practice, while answering: the recording pauses while the examiner talks. */
  function pauseAnswer() {
    const rec = recorder.current;
    if (rec?.state !== "recording") return;
    rec.pause();
    if (runningSince.current !== null) runMs.current += Date.now() - runningSince.current;
    runningSince.current = null;
  }
  function resumeAnswer() {
    const rec = recorder.current;
    if (rec?.state !== "paused") return;
    rec.resume();
    runningSince.current = Date.now();
  }

  /**
   * Read the question aloud. Exam: recording starts when the voice stops (or after a fallback
   * wait). Practice: nothing starts by itself; during an answer the recording pauses meanwhile.
   */
  const readAloud = useCallback(
    (text: string) => {
      const answering = recorder.current !== null && recorder.current.state !== "inactive";
      if (!answering) setPhase("reading");
      if (!tts) return; // no voice: the student reads it and taps "Start answering"
      const my = ++voiceRun.current;
      tts.cancel();
      if (answering) pauseAnswer();
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickExaminerVoice(tts.getVoices());
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = "en-GB";
      u.rate = 0.95;
      let finished = false;
      const done = () => {
        if (finished || !live.current || my !== voiceRun.current) return;
        finished = true;
        clearTimeout(fallback);
        voiceDone.current = null;
        setTalking(false);
        if (answering) resumeAnswer();
        else if (!practice) startRecording();
      };
      const fallback = setTimeout(done, TTS_FALLBACK_MS);
      u.onend = done;
      u.onerror = done;
      voiceDone.current = done;
      setTalking(true);
      tts.speak(u);
    },
    [tts, startRecording, practice],
  );

  /** Silence the examiner for good: its end event is ignored. */
  function silence() {
    voiceRun.current++;
    tts?.cancel();
    setTalking(false);
  }

  /** Practice "Stop": end the reading now, as if it had finished (a paused answer resumes). */
  function stopVoice() {
    const finish = voiceDone.current;
    tts?.cancel();
    finish?.();
  }

  /** examiner-turn with the answers so far: the newest is transcribed, then the next question or done. */
  const nextTurn = useCallback(async () => {
    setPhase(qa.current.length ? "sending" : "asking");
    const result = await examinerTurn(createClient(), { session_id: sessionId, part, topic_id: topic.id, turns: examinerTurns(qa.current) });
    if (!live.current) return;
    if (!result.data) return fail(`The examiner couldn't continue: ${result.error.message}`, result.error.code === "conflict" ? null : { kind: "turn" });
    const { transcribed, next_question, question_no, done } = result.data;
    if (transcribed && qa.current[transcribed.index]) qa.current[transcribed.index] = { ...qa.current[transcribed.index]!, transcript: transcribed.transcript };
    if (done || !next_question) return score();
    asked.current = { text: next_question, no: question_no ?? qa.current.length + 1 };
    setQuestion(asked.current);
    readAloud(next_question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, part, topic.id, fail, readAloud]);

  async function send(clip: Clip) {
    const question = asked.current;
    if (!live.current || !question) return;
    setPhase("sending");
    const supabase = createClient();
    try {
      const { contentType, ext } = uploadTypeFor(clip.recorderType);
      const path = answerPath(userId, sessionId, part, question.no, ext, crypto.randomUUID().slice(0, 8));
      const { data } = await supabase.auth.getSession();
      const { url, publishableKey } = getSupabaseEnv();
      await uploadWithRetry({ url, publishableKey, accessToken: data.session?.access_token ?? "", bucket: "speaking-audio", path, blob: clip.blob, contentType });
      qa.current = [...qa.current, { question: question.text, audioPath: path, seconds: clip.seconds }];
      setAnswered(qa.current.length);
    } catch (err) {
      const msg = err instanceof UploadError ? `The upload failed: ${err.message}.` : err instanceof Error ? err.message : "Something went wrong.";
      return fail(`${msg} Your answer is still here; try again when your connection is back.`, { kind: "send", clip });
    }
    await nextTurn();
  }

  async function score() {
    setPhase("scoring");
    const result = await run(() => scoreSpeaking(createClient(), { session_id: sessionId, topic_id: topic.id, part, answers: scoreAnswers(qa.current) }));
    if (!live.current) return;
    if (result.data) return scored.current(result.data);
    const refused = CREDIT_REFUSALS.includes(result.error.code);
    fail(refused ? "Your answers are saved. Top up or wait for tomorrow's allowance, then try again." : `Your answers couldn't be scored: ${result.error.message} No credits were kept; try again.`, result.error.code === "conflict" ? null : { kind: "score" });
  }

  function retry() {
    const r = error?.retry;
    setError(null);
    if (!r) return;
    if (r.kind === "send") void send(r.clip);
    else if (r.kind === "turn") void nextTurn();
    else void score();
  }

  // The opening question.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void nextTurn();
  }, [nextTurn]);

  // The answer clock (paused time not counted); the recorder stops at the part's limit.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const s = Math.floor(answerMs() / 1000);
      setElapsed(s);
      if (s >= max) stopRecording();
    }, 250);
    return () => clearInterval(t);
  }, [phase, max, stopRecording]);

  const { min, max: most } = QUESTIONS_PER_PART[part];
  // The question's own buttons: exam, only before answering; practice, the whole time.
  const showQuestionControls = phase === "reading" || (practice && phase === "recording");

  return (
    <section className="flex flex-col gap-5" aria-label={`Part ${part} examiner`} data-testid="examiner" data-mode={mode}>
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Part {part} · {topic.title} · {practice ? "Practice mode" : "Exam mode"}
        </span>
        <span data-testid="examiner-progress">
          {answered} of {min}–{most} answered
        </span>
      </div>

      {question && phase !== "scoring" && (
        <div className="flex flex-col gap-3 rounded-3xl bg-secondary p-6" data-testid="examiner-question">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Examiner · Question {question.no}</p>
          <p className="text-h3" aria-live="polite">
            {question.text}
          </p>
          {showQuestionControls && (
            <div className="flex flex-wrap items-center gap-3">
              {tts && talking && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Volume2 className="size-4" aria-hidden /> The examiner is asking…
                </span>
              )}
              {phase === "reading" && (
                <Button onClick={startRecording} data-testid="start-answer">
                  <Mic /> Start answering
                </Button>
              )}
              {tts && (
                <Button variant="ghost" onClick={() => readAloud(question.text)} data-testid="hear-again">
                  <RotateCcw /> Hear it again
                </Button>
              )}
              {tts && practice && talking && (
                <Button variant="ghost" onClick={stopVoice} data-testid="stop-voice">
                  <VolumeX /> Stop
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {phase === "recording" && (
        <div className="flex flex-col items-start gap-3 rounded-3xl border border-foreground/10 bg-card p-6" data-testid="answer-recording">
          <p className="flex items-center gap-3 text-h3 tabular-nums" aria-live="off">
            <span className={talking ? "size-3 rounded-full bg-muted-foreground" : "size-3 animate-pulse rounded-full bg-destructive"} aria-hidden />
            {talking ? "Paused" : "Answering"} {mmss(elapsed)} / {mmss(max)}
          </p>
          <p className="text-sm text-muted-foreground">
            {part === 1 ? "Answer naturally in two or three sentences." : "Give your opinion, explain why, and add an example."} Tap Done when you&apos;ve finished.
            {practice && " The recording pauses while the examiner repeats the question."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={stopRecording} data-testid="answer-done">
              <Square /> Done
            </Button>
            {practice && (
              <Button variant="outline" onClick={redoAnswer} data-testid="answer-redo">
                <Undo2 /> Record again
              </Button>
            )}
          </div>
        </div>
      )}

      {(phase === "asking" || phase === "sending" || phase === "scoring") && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status" data-testid="examiner-status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {phase === "asking" ? "The examiner is getting ready…" : phase === "sending" ? "Sending your answer…" : `Scoring Part ${part}… this usually takes under a minute.`}
        </p>
      )}

      {phase === "error" && error && (
        <div className="flex flex-col items-start gap-3 rounded-3xl border border-destructive/30 bg-card p-6">
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
          {error.retry && <Button onClick={retry}>Try again</Button>}
        </div>
      )}
    </section>
  );
}
