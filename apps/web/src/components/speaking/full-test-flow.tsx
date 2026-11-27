"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Mic } from "lucide-react";
import { cn } from "cn";
import { Button } from "@prepora/ui/components/button";
import { type SessionStage, sessionStage } from "@prepora/shared/ielts/speaking-session";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { useCredits } from "@/components/credits/credits-provider";
import { speakingSessionPath, speakingTestPath } from "@/lib/routes";
import { fullTestCredits } from "@/lib/speaking/examiner";
import { createClient } from "@/lib/supabase/client";
import { ExaminerPart } from "./examiner-part";
import { MicCheck } from "./mic-check";
import { type CueCardTopic, SpeakingFlow } from "./speaking-flow";

type Topic = { id: string; title: string };
type Step = "intro" | "mic" | "part" | "break";

const PART_NAMES = { 1: "Introduction and interview", 2: "Cue card", 3: "Discussion" } as const;

/**
 * M8-F2: the full Speaking test, as in the exam: Part 1 (the examiner's 4–5 questions about you)
 * → Part 2 (the cue card: 1 minute to prepare, up to 2 to speak; the M7 flow) → Part 3 (4–5
 * discussion questions following on from the card) → the session's results. One mic check for
 * the whole test. Each part is scored (and charged) when it ends; the stage comes from the parts
 * already scored (M8-C1), so a reload resumes at the right part with the same topics (the URL).
 */
export function FullTestFlow({
  topics,
  userId,
  session,
}: {
  topics: { part1: Topic; card: CueCardTopic; part3: Topic };
  userId: string;
  /** A test already started: its id and the parts scored so far. */
  session: { id: string; scored: number[] } | null;
}) {
  const router = useRouter();
  const { costs } = useCredits();
  const [step, setStep] = useState<Step>("intro");
  const [sessionId, setSessionId] = useState(session?.id ?? null);
  const [scored, setScored] = useState<number[]>(session?.scored ?? []);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<MediaStream | null>(null);
  const stage: SessionStage = sessionStage("full_test", scored);
  const credits = fullTestCredits(costs);

  useEffect(() => () => held.current?.getTracks().forEach((t) => t.stop()), []);

  async function begin(s: MediaStream) {
    held.current = s;
    setStream(s);
    setError(null);
    if (!sessionId) {
      const id = crypto.randomUUID();
      const { error: e } = await createClient().from("speaking_sessions").insert({ id, user_id: userId, mode: "full_test" });
      if (e) return setError(`We couldn't start your test (${e.message}). Try again.`);
      setSessionId(id);
      // A reload resumes this test with these topics.
      window.history.replaceState(null, "", speakingTestPath({ session: id, p1: topics.part1.id, card: topics.card.id, p3: topics.part3.id }));
    }
    setStep("part");
  }

  function partScored(part: 1 | 2 | 3) {
    const next = [...scored, part];
    setScored(next);
    if (sessionStage("full_test", next) === "finished") router.push(speakingSessionPath(sessionId!));
    else setStep("break");
  }

  const current = stage === "finished" ? null : (Number(stage.slice(4)) as 1 | 2 | 3);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="Test progress" data-testid="test-progress">
        {([1, 2, 3] as const).map((p) => {
          const done = scored.includes(p);
          const now = current === p && step !== "intro";
          return (
            <li
              key={p}
              aria-current={now ? "step" : undefined}
              className={cn("flex items-center gap-2 rounded-full px-3 py-1", done ? "bg-primary text-primary-foreground" : now ? "bg-secondary font-medium" : "bg-muted text-muted-foreground")}
            >
              {done && <Check className="size-3.5" aria-hidden />} Part {p} · {PART_NAMES[p]}
            </li>
          );
        })}
      </ol>

      {step === "intro" && (
        <section className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6" data-testid="test-intro">
          <h2 className="text-h3">{session ? "Continue your test" : "About 12 minutes, like the real test"}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
            <li>Part 1: the examiner asks 4–5 questions about {topics.part1.title.toLowerCase()}.</li>
            <li>Part 2: a cue card, 1 minute to prepare, then speak for up to 2 minutes.</li>
            <li>Part 3: 4–5 discussion questions following on from your cue card.</li>
            <li>The questions are read aloud: turn your sound on. Recording starts when the examiner stops speaking.</li>
          </ul>
          {session ? (
            <Button className="self-start" onClick={() => setStep("mic")}>
              Continue with Part {current} <ArrowRight />
            </Button>
          ) : (
            <CostConfirm
              actionKey="speaking_p1"
              credits={credits ?? undefined}
              description="The full test: each part is scored, and charged, when it ends. Nothing is charged for a part that can't be scored."
              confirmLabel="Start the test"
              onConfirm={() => setStep("mic")}
              trigger={
                <Button className="self-start">
                  <Mic /> Start the full test
                </Button>
              }
            />
          )}
        </section>
      )}

      {step === "mic" && (
        <div className="flex flex-col gap-3">
          {!stream && <MicCheck onReady={(s) => void begin(s)} />}
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
      )}

      {step === "break" && current && (
        <section className="flex flex-col items-start gap-3 rounded-3xl bg-secondary p-6" data-testid="test-break">
          <h2 className="text-h3">Part {current - 1} done</h2>
          <p className="text-sm text-muted-foreground">
            Next: Part {current}, {PART_NAMES[current].toLowerCase()}.{current === 3 ? ` The examiner will ask about ideas linked to "${topics.card.title}".` : ""} Your bands come at the end.
          </p>
          <Button onClick={() => setStep("part")}>
            Start Part {current} <ArrowRight />
          </Button>
        </section>
      )}

      {step === "part" && sessionId && stream && current === 1 && (
        <ExaminerPart key="p1" sessionId={sessionId} part={1} topic={topics.part1} userId={userId} stream={stream} onScored={() => partScored(1)} />
      )}
      {step === "part" && sessionId && stream && current === 2 && (
        <SpeakingFlow key="p2" topic={topics.card} userId={userId} session={{ id: sessionId }} stream={stream} onScored={() => partScored(2)} />
      )}
      {step === "part" && sessionId && stream && current === 3 && (
        <ExaminerPart key="p3" sessionId={sessionId} part={3} topic={topics.part3} userId={userId} stream={stream} onScored={() => partScored(3)} />
      )}
    </div>
  );
}
