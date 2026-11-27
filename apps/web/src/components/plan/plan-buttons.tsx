"use client";

import { useTransition } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "@prepora/ui/components/sonner";
import { assignStudyPlan } from "@/lib/study-actions";

// M8.7-F2 buttons: get a plan (first visit), or start a new one (after a confirmation).

export function GetPlanButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await assignStudyPlan(false);
          if (!r.ok) toast.error(r.message);
        })
      }
      className="inline-flex h-11 items-center gap-2 self-start rounded-full bg-brand-ink px-5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60 dark:bg-primary dark:text-primary-foreground"
    >
      <Sparkles className="size-4" aria-hidden /> {pending ? "Setting up…" : "Get my study plan"}
    </button>
  );
}

export function RestartPlanButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Start a new study plan? Your progress on this one won't carry over.")) return;
        start(async () => {
          const r = await assignStudyPlan(true);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
        });
      }}
      className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-sm text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
    >
      <RefreshCw className="size-3.5" aria-hidden /> {pending ? "Starting…" : "Start a new plan"}
    </button>
  );
}
