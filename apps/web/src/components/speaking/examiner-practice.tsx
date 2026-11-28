"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Mic, Repeat } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { SPEAKING_PARTS } from "@prepora/shared/ielts/speaking";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { speakingResponsePath } from "@/lib/routes";
import { practiceMode } from "@/lib/speaking/examiner";
import { createClient } from "@/lib/supabase/client";
import { ExaminerPart, type SpeakingMode } from "./examiner-part";
import { ModeOption } from "@/components/practice/mode-option";
import { MicCheck } from "./mic-check";

/**
 * M8-F1: practise one Part 1 or Part 3 with the AI examiner: what happens and what it costs →
 * the mic check → a practice session (mode part1/part3) → the examiner → the feedback page.
 * The student picks Exam mode (like test day) or Practice mode (replay, stop, record again).
 */
export function ExaminerPractice({ part, topic, userId }: { part: 1 | 3; topic: { id: string; title: string }; userId: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"intro" | "mic" | "test">("intro");
  const [mode, setMode] = useState<SpeakingMode>("exam");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const held = useRef<MediaStream | null>(null);

  useEffect(() => () => held.current?.getTracks().forEach((t) => t.stop()), []);

  async function begin(s: MediaStream) {
    held.current = s;
    setStream(s);
    const id = crypto.randomUUID();
    const { error: e } = await createClient().from("speaking_sessions").insert({ id, user_id: userId, mode: practiceMode(part) });
    if (e) return setError(`We couldn't start your session (${e.message}). Try again.`);
    setSessionId(id);
    setStep("test");
  }

  if (step === "intro") {
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6" data-testid="examiner-intro">
        <h2 className="text-h3">How it works</h2>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>The examiner asks 4–5 questions, out loud and on screen{part === 3 ? ", following up on what you say" : ""}.</li>
          <li>Tap Done when you&apos;ve answered each one.</li>
          <li>At the end you get a band for each criterion, your transcript and feedback.</li>
        </ul>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Mode" data-testid="speaking-mode">
          <ModeOption
            selected={mode === "exam"}
            onSelect={() => setMode("exam")}
            icon={<GraduationCap className="size-4" aria-hidden />}
            title="Exam mode"
            body="Like test day: recording starts as soon as the examiner stops speaking. You can hear the question again only before you answer."
            testId="mode-exam"
          />
          <ModeOption
            selected={mode === "practice"}
            onSelect={() => setMode("practice")}
            icon={<Repeat className="size-4" aria-hidden />}
            title="Practice mode"
            body="Start answering when you're ready. Hear the question again or stop it at any time, even while answering, and record an answer again."
            testId="mode-practice"
          />
        </div>
        <CostConfirm
          actionKey={SPEAKING_PARTS[part].actionKey}
          description={`Part ${part} with the AI examiner, scored at the end. Nothing is charged if it can't be scored.`}
          confirmLabel="Start"
          onConfirm={() => setStep("mic")}
          trigger={
            <Button className="self-start">
              <Mic /> Start Part {part} · {mode === "exam" ? "Exam" : "Practice"}
            </Button>
          }
        />
      </section>
    );
  }
  if (step === "mic" || !sessionId || !stream) {
    return (
      <div className="flex flex-col gap-3">
        {!stream && <MicCheck onReady={(s) => void begin(s)} />}
        {stream && !error && <p className="text-muted-foreground">Starting…</p>}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {error && stream && (
          <Button className="self-start" onClick={() => void begin(stream)}>
            Try again
          </Button>
        )}
      </div>
    );
  }
  return <ExaminerPart sessionId={sessionId} part={part} topic={topic} userId={userId} stream={stream} mode={mode} onScored={(r) => router.push(speakingResponsePath(r.response_id))} />;
}
