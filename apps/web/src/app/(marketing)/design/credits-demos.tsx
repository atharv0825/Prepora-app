"use client";

import type { CreditBalance, CreditErrorCode } from "@prepora/shared/api/credits";
import { Button } from "@prepora/ui/components/button";
import { toast } from "@prepora/ui/components/sonner";
import { CostConfirm } from "@/components/credits/cost-confirm";
import { CreditsProvider, useCredits } from "@/components/credits/credits-provider";
import type { CreditCosts } from "@/lib/credits";

// Credit dialogs (M3-F2/F3) with sample data: no AI action exists yet (M6+), so this is where
// they can be seen and tested (e2e/credits-ui.spec.ts). live={false}: nothing is fetched.

const sample: CreditBalance = {
  plan: "free",
  balance: 5,
  buckets: [
    { id: "00000000-0000-4000-8000-000000000001", source: "monthly", granted: 8, remaining: 5, expires_at: "2099-01-01T00:00:00Z" },
  ],
  spent_today: 4,
  daily_cap: 8,
  period_start: "2026-11-01",
  allowances: [],
};

const costs: CreditCosts = {
  writing_t2: { label: "Writing Task 2 scored", credits: 4 },
  speaking_p3: { label: "Speaking Part 3 scored", credits: 6 },
  speaking_p1: { label: "Speaking Part 1 scored", credits: 5 },
};

const errors: { code: CreditErrorCode; label: string; details: Record<string, unknown> }[] = [
  { code: "insufficient_credits", label: "Out of credits", details: { action_key: "writing_t2", credits: 4, balance: 2 } },
  { code: "daily_cap_reached", label: "Daily limit", details: { action_key: "writing_t2", credits: 4, daily_cap: 8, spent_today: 8 } },
  { code: "allowance_exceeded", label: "Allowance used", details: { type: "reading_tests", used: 2, limit: 2 } },
  { code: "feature_not_in_plan", label: "Not in plan", details: { action_key: "ocr", credits: 1, feature: "ocr" } },
];

export function CreditsDemo() {
  return (
    <CreditsProvider initialCredits={sample} costs={costs} live={false}>
      <Demo />
    </CreditsProvider>
  );
}

function Demo() {
  const { showCreditError } = useCredits();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Sample balance: 5 credits, 4 of today&apos;s 8 used. The cost confirm before an AI action (enough, not enough credits, over the daily limit):
        </p>
        <div className="flex flex-wrap gap-3">
          <CostConfirm
            actionKey="writing_t2"
            confirmLabel="Score my essay"
            onConfirm={() => toast.success("Scoring started")}
            trigger={<Button>Score Task 2 (4 credits)</Button>}
          />
          <CostConfirm
            actionKey="speaking_p3"
            confirmLabel="Start Part 3"
            onConfirm={() => toast.success("Part 3 started")}
            trigger={<Button variant="outline">Speaking Part 3 (6 credits)</Button>}
          />
          <CostConfirm
            actionKey="speaking_p1"
            confirmLabel="Start Part 1"
            onConfirm={() => toast.success("Part 1 started")}
            trigger={<Button variant="outline">Speaking Part 1 (5 credits)</Button>}
          />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">What a refused AI call shows (the API&apos;s error codes):</p>
        <div className="flex flex-wrap gap-3">
          {errors.map((e) => (
            <Button key={e.code} variant="secondary" onClick={() => showCreditError({ code: e.code, details: e.details })}>
              {e.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
