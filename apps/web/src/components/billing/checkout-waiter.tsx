"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Clock, LoaderCircle } from "lucide-react";
import { purchaseConfirmed } from "@prepora/shared/api/billing";
import { buttonVariants } from "@prepora/ui/components/button";
import { useCredits } from "@/components/credits/credits-provider";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 2_000;
const GIVE_UP_MS = 90_000;
const PLAN_NAME: Record<string, string> = { gold: "Gold", platinum: "Platinum" };

type Bought = { kind: "subscription" | "exam_pack" | "topup"; plan_id: string | null; credits: number | null };

/**
 * M9-F2: polls (as the student, RLS) until the purchase shows up: the profile's plan for a plan
 * or exam pack, a new top-up bucket for credits. Then refreshes the app (header credits, plan
 * badges). After 90 s it stops and says the payment is safe and still being confirmed.
 */
export function CheckoutWaiter({ bought, since }: { bought: Bought; since: number | null }) {
  const router = useRouter();
  const { refresh } = useCredits();
  const [state, setState] = useState<"waiting" | "done" | "slow">("waiting");
  // Once confirmed, never poll again: router.refresh() re-renders the page with new props.
  const finished = useRef(false);
  const { kind, plan_id: planId } = bought;

  useEffect(() => {
    if (finished.current) return;
    const supabase = createClient();
    const started = Date.now();
    // No start time in the URL: count top-ups from the last 10 minutes.
    const from = new Date(since ?? started - 10 * 60_000).toISOString();
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function check() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user || stop) return;
      const [{ data: profile }, topups] = await Promise.all([
        supabase.from("profiles").select("plan").eq("id", auth.user.id).maybeSingle(),
        kind === "topup"
          ? supabase.from("credit_buckets").select("id", { count: "exact", head: true }).eq("source", "topup").gte("created_at", from)
          : Promise.resolve({ count: 0 }),
      ]);
      if (stop) return;
      if (purchaseConfirmed({ kind, plan_id: planId }, { plan: profile?.plan ?? "free", topupSince: (topups.count ?? 0) > 0 })) {
        finished.current = true;
        setState("done");
        void refresh();
        router.refresh();
        return;
      }
      if (Date.now() - started > GIVE_UP_MS) {
        finished.current = true;
        setState("slow");
        return;
      }
      timer = setTimeout(check, POLL_MS);
    }
    void check();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [kind, planId, since, refresh, router]);

  const what = bought.kind === "topup" ? `${bought.credits} credits` : `${PLAN_NAME[bought.plan_id ?? ""] ?? "your plan"}${bought.kind === "exam_pack" ? " (3-month exam pack)" : ""}`;

  if (state === "done") {
    return (
      <div className="flex flex-col items-start gap-4" data-testid="checkout-done">
        <CircleCheck className="size-10 text-primary" aria-hidden />
        <h1 className="text-h1">{bought.kind === "topup" ? `${bought.credits} credits added` : `You're on ${what}`}</h1>
        <p className="text-muted-foreground">
          {bought.kind === "topup" ? "They're in your balance now and last 12 months." : "Your new limits and credits are ready."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={routes.app} className={buttonVariants()}>
            Back to practice
          </Link>
          <Link href={routes.credits} className={buttonVariants({ variant: "outline" })}>
            See my credits
          </Link>
        </div>
      </div>
    );
  }

  if (state === "slow") {
    return (
      <div role="status" className="flex flex-col items-start gap-4" data-testid="checkout-slow">
        <Clock className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-h2">Still confirming your payment</h1>
        <p className="text-muted-foreground">
          Your payment went through, but {what} hasn&apos;t arrived yet. It usually takes a few seconds and sometimes a few minutes. You don&apos;t need to pay again: reload
          this page later, or contact us if it hasn&apos;t arrived in an hour.
        </p>
        <button type="button" onClick={() => window.location.reload()} className={buttonVariants({ variant: "outline" })}>
          Check again
        </button>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="flex flex-col items-start gap-4" data-testid="checkout-waiting">
      <LoaderCircle className="size-10 animate-spin text-primary" aria-hidden />
      <h1 className="text-h2">Confirming your payment…</h1>
      <p className="text-muted-foreground">Payment received. We&apos;re adding {what} to your account; this takes a few seconds. Please keep this page open.</p>
    </div>
  );
}
