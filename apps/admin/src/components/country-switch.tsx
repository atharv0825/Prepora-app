"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "@prepora/ui/components/sonner";
import { cn } from "@prepora/ui/lib/utils";
import { setCountryEnabled } from "@/lib/country-actions";

/**
 * Sign-up on/off for one country (M2-A2). Flips at once (optimistic) and rolls back with a toast
 * if the server says no. A real button with role="switch", so it works with keyboard and
 * screen readers.
 */
export function CountrySwitch({ code, name, enabled }: { code: string; name: string; enabled: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setCountryEnabled(code, next);
      if (!result.ok) toast.error(result.message);
      else toast.success(`${name}: sign-up ${result.enabled ? "open" : "closed (waitlist)"}`);
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={`Sign-up in ${name}`}
      onClick={toggle}
      disabled={pending}
      className={cn(
        "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-wait disabled:opacity-70",
        optimistic ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          optimistic ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}
