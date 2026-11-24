"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CreditBalance } from "@prepora/shared/api/credits";
import type { ApiErrorBody } from "@prepora/shared/api/errors";
import { type CreditCheck, type CreditCosts, type CreditError, checkCost, fetchMyCredits, toCreditError } from "@/lib/credits";
import { createClient } from "@/lib/supabase/client";
import type { FunctionResult } from "@/lib/supabase/functions";
import { CreditErrorDialog } from "./credit-error-dialog";

// M3-F2: one place in the signed-in app that holds the user's credits. The server renders the
// first value (layout → getMyCredits), so the header chip shows the balance without a loading
// state; the client refreshes it after an AI call and when the tab comes back into focus.

type CreditsContextValue = {
  /** null: couldn't be loaded (signed out, network, profile row missing). */
  credits: CreditBalance | null;
  costs: CreditCosts;
  /** Cost of an action from credit_costs; null for an unknown or inactive action. */
  costOf: (actionKey: string) => number | null;
  /** Can the user afford `credits` now? null while the balance is unknown. A hint only. */
  check: (credits: number, actionKey?: string) => CreditCheck | null;
  refresh: () => Promise<void>;
  /** M3-F3: open the out-of-credits / allowance dialog for a credit error. False for other errors. */
  showCreditError: (error: Pick<ApiErrorBody["error"], "code" | "details"> | null | undefined) => boolean;
  /**
   * Run an AI call (an Edge Function using withCredits): shows the credit dialog on a refusal
   * and refreshes the balance afterwards, whatever happened (spent, refused or refunded).
   */
  run: <T>(call: () => Promise<FunctionResult<T>>) => Promise<FunctionResult<T>>;
};

const CreditsContext = createContext<CreditsContextValue | null>(null);

/** Don't refetch on every focus change: at most this often. */
const FOCUS_REFRESH_MS = 30_000;

export function CreditsProvider({
  initialCredits,
  costs,
  live = true,
  children,
}: {
  initialCredits: CreditBalance | null;
  costs: CreditCosts;
  /** false: never fetch (the /design showcase renders it with sample data, signed out). */
  live?: boolean;
  children: ReactNode;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [creditError, setCreditError] = useState<CreditError | null>(null);
  /** When the balance was last loaded (the server render counts: set on mount). */
  const lastFetch = useRef(0);

  // A server render with newer data (router.refresh, navigation) replaces the client copy.
  const [prevInitial, setPrevInitial] = useState(initialCredits);
  if (initialCredits !== prevInitial) {
    setPrevInitial(initialCredits);
    if (initialCredits) setCredits(initialCredits);
  }

  const refresh = useCallback(async () => {
    if (!live) return;
    lastFetch.current = Date.now();
    const next = await fetchMyCredits(createClient());
    // Keep the last known balance on a failed refresh rather than blanking the chip.
    if (next) setCredits(next);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    lastFetch.current = Date.now();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastFetch.current > FOCUS_REFRESH_MS) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [live, refresh]);

  const showCreditError = useCallback<CreditsContextValue["showCreditError"]>((error) => {
    const creditErr = toCreditError(error);
    if (creditErr) setCreditError(creditErr);
    return creditErr !== null;
  }, []);

  const run = useCallback(
    async <T,>(call: () => Promise<FunctionResult<T>>): Promise<FunctionResult<T>> => {
      try {
        const result = await call();
        if (result.error) showCreditError(result.error);
        return result;
      } finally {
        void refresh();
      }
    },
    [refresh, showCreditError],
  );

  const value = useMemo<CreditsContextValue>(
    () => ({
      credits,
      costs,
      costOf: (actionKey) => costs[actionKey]?.credits ?? null,
      check: (n, actionKey) => (credits ? checkCost(credits, n, actionKey) : null),
      refresh,
      showCreditError,
      run,
    }),
    [credits, costs, refresh, showCreditError, run],
  );

  return (
    <CreditsContext.Provider value={value}>
      {children}
      <CreditErrorDialog error={creditError} onClose={() => setCreditError(null)} />
    </CreditsContext.Provider>
  );
}

/** M3-F2: the user's credits and the credit actions. Inside the signed-in app (CreditsProvider). */
export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits() must be used inside <CreditsProvider>");
  return ctx;
}
