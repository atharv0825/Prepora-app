"use client";

import { useActionState, useId } from "react";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import type { WaitlistResult } from "@prepora/shared/api/waitlist";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { cn } from "@prepora/ui/lib/utils";
import { joinWaitlist } from "./actions";

const initial: WaitlistResult = { status: "idle" };

/**
 * Email capture for the beta waitlist. `location` is stored as the source unless the visitor
 * arrived with ?utm_source=… (then that wins). Works on dark and light sections.
 */
export function WaitlistForm({
  location,
  className,
}: {
  location: "hero" | "final_cta";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(joinWaitlist, initial);
  const id = useId();
  const emailId = `${id}-email`;
  const errorId = `${id}-error`;

  // Read ?utm_source at submit time (no extra state/effects needed).
  const submit = (formData: FormData) => {
    const utm = new URLSearchParams(window.location.search).get("utm_source");
    formData.set("source", utm ? `utm:${utm}`.slice(0, 64) : location);
    formAction(formData);
  };

  if (state.status === "success") {
    return (
      <div
        role="status"
        className={cn("flex items-start gap-3 rounded-2xl border border-border p-4", className)}
      >
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
        <div>
          <p className="font-medium">You&apos;re on the list.</p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll email you when your free beta invite is ready.
          </p>
        </div>
      </div>
    );
  }

  const error = state.status === "error" ? state : null;

  return (
    <form action={submit} noValidate className={cn("w-full max-w-md", className)}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor={emailId} className="sr-only">
          Email address
        </label>
        <Input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          disabled={pending}
          aria-invalid={error?.field === "email" || undefined}
          aria-describedby={error ? errorId : undefined}
          className="h-12 sm:flex-1"
        />
        <Button type="submit" size="lg" disabled={pending} className="shrink-0">
          {pending ? (
            <>
              <Loader2 className="animate-spin" /> Joining…
            </>
          ) : (
            <>
              Join the waitlist <ArrowRight />
            </>
          )}
        </Button>
      </div>
      {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Company <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <p
        id={errorId}
        aria-live="polite"
        className={cn("mt-2 min-h-5 text-sm", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ? error.message : "Free during beta. We only email you about early access."}
      </p>
    </form>
  );
}
