"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Mic, MicOff, ShieldCheck } from "lucide-react";
import { cn } from "cn";
import { Button } from "@prepora/ui/components/button";
import { browserKind, levelFromSamples, MIC_OK_LEVEL, micHelp, type MicProblem, micProblem } from "@/lib/speaking/speaking";

/**
 * M7-F1: why we need the microphone (asked only when the student taps, plan §5.1) → the browser's
 * permission prompt → a mic test with a live level meter ("say something") → ready. A refusal or a
 * missing microphone shows what happened and how to fix it in this browser.
 */
export function MicCheck({ onReady }: { onReady: (stream: MediaStream) => void }) {
  const [step, setStep] = useState<"explain" | "asking" | "testing" | "problem">("explain");
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const handedOver = useRef(false);

  // Stop the microphone if the student leaves before using it.
  useEffect(
    () => () => {
      if (!handedOver.current) stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // The level meter while testing.
  useEffect(() => {
    if (step !== "testing" || !stream.current) return;
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream.current).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      const l = levelFromSamples(buf);
      setLevel(l);
      if (l >= MIC_OK_LEVEL) setHeard(true);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [step]);

  async function ask() {
    if (!window.isSecureContext) {
      setProblem("insecure");
      setStep("problem");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem("unsupported");
      setStep("problem");
      return;
    }
    setStep("asking");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      setStep("testing");
    } catch (err) {
      setProblem(micProblem(err));
      setStep("problem");
    }
  }

  if (step === "explain" || step === "asking") {
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6" aria-label="Microphone" data-testid="mic-explainer">
        <h2 className="flex items-center gap-2 text-h3">
          <Mic className="size-5" aria-hidden /> We need your microphone
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>You&apos;ll answer out loud, as in the real Speaking test. We record only while the recording timer runs.</li>
          <li className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            Your recording is private to you, used only to score your answer, and deleted after 30 days. The transcript and feedback stay in your history.
          </li>
          <li>Find a quiet place, and hold your phone or sit about an arm&apos;s length from your computer.</li>
        </ul>
        <Button onClick={() => void ask()} disabled={step === "asking"} className="self-start">
          <Mic /> {step === "asking" ? "Waiting for your browser…" : "Allow microphone"}
        </Button>
        {step === "asking" && <p className="text-sm text-muted-foreground">Choose &quot;Allow&quot; in your browser&apos;s message.</p>}
      </section>
    );
  }

  if (step === "problem") {
    const help = micHelp(browserKind(navigator.userAgent));
    const text: Record<MicProblem, string> = {
      denied: "Your browser blocked the microphone for this site.",
      no_device: "We couldn't find a microphone. Plug one in, or use your phone.",
      busy: "Your microphone is being used by another app (a call, a recorder). Close it and try again.",
      insecure: "The microphone only works on a secure (https) page.",
      unsupported: "This browser can't record audio. Use a recent Chrome, Safari, Edge or Firefox.",
      other: "We couldn't start your microphone.",
    };
    return (
      <section className="flex flex-col gap-4 rounded-3xl border border-destructive/30 bg-card p-6" role="alert" aria-label="Microphone problem" data-testid="mic-problem">
        <h2 className="flex items-center gap-2 text-h3">
          <MicOff className="size-5" aria-hidden /> {text[problem ?? "other"]}
        </h2>
        {problem === "denied" && (
          <div className="flex flex-col gap-2 text-sm" data-testid="mic-help">
            <p className="font-medium">To allow it in {help.title}:</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
              {help.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        )}
        <Button variant="outline" onClick={() => void ask()} className="self-start">
          Try again
        </Button>
      </section>
    );
  }

  // Testing.
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-foreground/5 bg-card p-6" aria-label="Microphone test" data-testid="mic-test">
      <h2 className="text-h3">Test your microphone</h2>
      <p className="text-sm text-muted-foreground">Say a few words, like your name and where you live. The bar should move when you speak.</p>
      <div className="h-3 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
        <div className={cn("h-full rounded-full transition-[width] duration-75", heard ? "bg-primary" : "bg-amber-500")} style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      <p className={cn("flex items-center gap-2 text-sm", heard ? "font-medium" : "text-muted-foreground")} aria-live="polite" data-testid="mic-status">
        {heard ? (
          <>
            <Check className="size-4" aria-hidden /> We can hear you.
          </>
        ) : (
          "Listening… speak normally."
        )}
      </p>
      <Button
        onClick={() => {
          handedOver.current = true;
          onReady(stream.current!);
        }}
        disabled={!heard}
        className="self-start"
      >
        Continue
      </Button>
      {!heard && <p className="text-xs text-muted-foreground">If the bar doesn&apos;t move, check your microphone isn&apos;t muted, or pick another one in your system settings.</p>}
    </section>
  );
}
