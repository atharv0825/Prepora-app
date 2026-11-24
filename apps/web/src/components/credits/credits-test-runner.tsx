"use client";

import { useState } from "react";
import { Button } from "@prepora/ui/components/button";
import { toast } from "@prepora/ui/components/sonner";
import { creditsText } from "@/lib/credits";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";
import { CostConfirm } from "./cost-confirm";
import { useCredits } from "./credits-provider";

/** What credits-test returns (supabase/functions/credits-test). */
type CreditsTestResponse = { ok: true; credits: number; balance_after: number; reservation_id: string };

/**
 * M3-I1: the path every AI feature will take (M6+): <CostConfirm> → useCredits().run(Edge
 * Function) → the credit dialog on a refusal, the balance refreshed afterwards in every case.
 */
export function CreditsTestRunner() {
  const { run } = useCredits();
  const [busy, setBusy] = useState(false);

  async function start(fail: boolean) {
    setBusy(true);
    try {
      const result = await run(() => invokeFunction<CreditsTestResponse>(createClient(), "credits-test", { body: { fail } }));
      if (result.data) toast.success(`Done: ${creditsText(result.data.credits)} spent. ${result.data.balance_after} left.`);
      // Credit refusals open their dialog (run); anything else is the failed "AI call".
      else if (result.error.code === "internal") toast.error(result.error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <CostConfirm
        actionKey="writing_t2"
        description="Credits test (Writing Task 2 price)"
        confirmLabel="Run test"
        onConfirm={() => void start(false)}
        trigger={<Button disabled={busy}>Run test</Button>}
        disabled={busy}
      />
      <CostConfirm
        actionKey="writing_t2"
        description="Credits test that fails, so the credits come back"
        confirmLabel="Run failing test"
        onConfirm={() => void start(true)}
        trigger={
          <Button variant="outline" disabled={busy}>
            Run failing test
          </Button>
        }
        disabled={busy}
      />
    </div>
  );
}
