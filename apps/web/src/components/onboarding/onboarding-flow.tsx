"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import {
  onboardingBands,
  onboardingInput,
  onboardingSteps,
  type OnboardingInput,
  type OnboardingStep,
} from "@prepora/shared/api/onboarding";
import type { TestType } from "@prepora/shared/types/profile";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { cn } from "@prepora/ui/lib/utils";
import { track } from "@/lib/analytics";
import { completeOnboarding } from "@/lib/onboarding-actions";
import { daysBetween, examDateRange, formatBand, localDate } from "@/lib/onboarding";
import { routes } from "@/lib/routes";

// The 3-step onboarding (M2-F2): Academic or General → target band → exam date (skippable).
// Answers stay in this component and are saved once, at the end (completeOnboarding validates
// them again on the server). Each step is a native radio group / date input, so keyboard and
// screen-reader support come from the browser.

const testTypeOptions: { value: TestType; title: string; description: string }[] = [
  {
    value: "academic",
    title: "Academic",
    description: "For university study or professional registration (doctors, nurses, engineers).",
  },
  {
    value: "general",
    title: "General Training",
    description: "For work, migration (Canada, Australia, UK, NZ) or secondary education.",
  },
];

const stepCopy: Record<OnboardingStep, { title: ReactNode; description: string }> = {
  test_type: {
    title: (
      <>
        Which IELTS are you <span className="text-accent-serif">taking?</span>
      </>
    ),
    description: "Reading and Writing Task 1 differ between the two, so we tailor your practice.",
  },
  target_band: {
    title: (
      <>
        What band are you <span className="text-accent-serif">aiming for?</span>
      </>
    ),
    description: "Your overall target. You can change it later.",
  },
  exam_date: {
    title: (
      <>
        When is your <span className="text-accent-serif">exam?</span>
      </>
    ),
    description: "We'll count down the days and pace your practice. Not booked yet? Skip this.",
  },
};

type Draft = { test_type: TestType | null; target_band: number | null; exam_date: string };

export function OnboardingFlow({ initial }: { initial: Partial<OnboardingInput> }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    test_type: initial.test_type ?? null,
    target_band: initial.target_band ?? null,
    exam_date: initial.exam_date ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The student's own "today" (their time zone), for the date picker and validation.
  const { timeZone, today, range } = useMemo(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const d = localDate(tz);
    return { timeZone: tz, today: d, range: examDateRange(d) };
  }, []);

  const step = onboardingSteps[stepIndex]!;
  const isLast = stepIndex === onboardingSteps.length - 1;
  const schema = onboardingInput(today);

  function stepError(s: OnboardingStep, examDate: string | null): string | null {
    const value = s === "exam_date" ? examDate : draft[s];
    const result = schema.shape[s].safeParse(value);
    return result.success ? null : (result.error.issues[0]?.message ?? "Check your answer.");
  }

  function submit(examDate: string | null) {
    const answers = { test_type: draft.test_type, target_band: draft.target_band, exam_date: examDate };
    const parsed = schema.safeParse(answers);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const at = onboardingSteps.indexOf(first?.path[0] as OnboardingStep);
      if (at >= 0) setStepIndex(at);
      setError(first?.message ?? "Check your answers.");
      return;
    }
    startTransition(async () => {
      const result = await completeOnboarding(parsed.data, timeZone);
      if (result.status === "error") {
        if (result.step) setStepIndex(onboardingSteps.indexOf(result.step));
        setError(result.message);
        return;
      }
      track("onboarding_completed", {
        test_type: parsed.data.test_type,
        target_band: parsed.data.target_band,
        exam_date: parsed.data.exam_date,
        days_to_exam: parsed.data.exam_date ? daysBetween(today, parsed.data.exam_date) : null,
      });
      router.replace(routes.app);
      router.refresh();
    });
  }

  function next() {
    const examDate = draft.exam_date || null;
    if (step === "exam_date" && !examDate) {
      setError("Choose a date, or skip this step.");
      return;
    }
    const message = stepError(step, examDate);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    if (isLast) submit(examDate);
    else setStepIndex(stepIndex + 1);
  }

  function back() {
    setError(null);
    setStepIndex(Math.max(0, stepIndex - 1));
  }

  const copy = stepCopy[step];
  const errorId = "onboarding-error";

  return (
    <form
      className="mx-auto flex w-full max-w-xl flex-col gap-8"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="text-eyebrow text-muted-foreground">
            Step {stepIndex + 1} of {onboardingSteps.length}
          </p>
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {onboardingSteps.map((s, i) => (
              <span
                key={s}
                className={cn("h-1 flex-1 rounded-full", i <= stepIndex ? "bg-primary" : "bg-foreground/10")}
              />
            ))}
          </div>
        </div>
        <h1 className="text-h2">{copy.title}</h1>
        <p className="text-muted-foreground">{copy.description}</p>
      </div>

      <fieldset
        className="flex flex-col gap-3"
        aria-describedby={error ? errorId : undefined}
        disabled={pending}
      >
        <legend className="sr-only">{step === "test_type" ? "IELTS test" : step === "target_band" ? "Target band" : "Exam date"}</legend>

        {step === "test_type" &&
          testTypeOptions.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-start gap-4 rounded-2xl border border-border p-5 transition-colors hover:border-foreground/40 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
            >
              <input
                type="radio"
                name="test_type"
                value={o.value}
                checked={draft.test_type === o.value}
                onChange={() => {
                  setDraft({ ...draft, test_type: o.value });
                  setError(null);
                }}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col gap-1">
                <span className="font-medium">{o.title}</span>
                <span className="text-sm text-muted-foreground">{o.description}</span>
              </span>
            </label>
          ))}

        {step === "target_band" && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {onboardingBands.map((band) => (
              <label
                key={band}
                className="flex h-12 cursor-pointer items-center justify-center rounded-xl border border-border font-medium tabular-nums transition-colors hover:border-foreground/40 has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/40"
              >
                <input
                  type="radio"
                  name="target_band"
                  value={band}
                  checked={draft.target_band === band}
                  onChange={() => {
                    setDraft({ ...draft, target_band: band });
                    setError(null);
                  }}
                  className="sr-only"
                />
                {formatBand(band)}
              </label>
            ))}
          </div>
        )}

        {step === "exam_date" && (
          <div className="flex flex-col gap-2">
            <label htmlFor="exam_date" className="text-sm font-medium">
              Exam date
            </label>
            <Input
              id="exam_date"
              name="exam_date"
              type="date"
              min={range.min}
              max={range.max}
              value={draft.exam_date}
              onChange={(e) => {
                setDraft({ ...draft, exam_date: e.target.value });
                setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              className="h-12 sm:max-w-xs"
            />
          </div>
        )}
      </fieldset>

      <p id={errorId} role="alert" aria-live="polite" className="-mt-4 min-h-5 text-sm text-destructive">
        {error}
      </p>

      {/* Mobile: full-width buttons stacked, main action on top. sm+: Back left, actions right. */}
      <div className="-mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        {stepIndex > 0 && (
          <Button type="button" variant="ghost" onClick={back} disabled={pending} className="w-full sm:w-auto">
            <ArrowLeft /> Back
          </Button>
        )}
        <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row sm:items-center">
          {step === "exam_date" && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="w-full sm:w-auto"
              onClick={() => {
                setError(null);
                setDraft({ ...draft, exam_date: "" });
                submit(null);
              }}
            >
              Skip, I haven&apos;t booked yet
            </Button>
          )}
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? (
              <>
                <Loader2 className="animate-spin" /> Saving…
              </>
            ) : isLast ? (
              <>
                Finish <ArrowRight />
              </>
            ) : (
              <>
                Continue <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
