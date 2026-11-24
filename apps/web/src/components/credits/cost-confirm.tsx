"use client";

import { useState, type ReactElement } from "react";
import { Coins } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@prepora/ui/components/dialog";
import { creditErrorView, creditsText } from "@/lib/credits";
import { CreditErrorActions } from "./credit-error-dialog";
import { useCredits } from "./credits-provider";

/**
 * M3-F2: "This costs N credits" before an AI action. Wraps the button that starts it:
 *
 *   <CostConfirm actionKey="writing_t2" confirmLabel="Score my essay" onConfirm={submit}
 *     trigger={<Button>Get my band score</Button>} />
 *
 * The cost comes from credit_costs (admin-tunable), or `credits` when given. When the balance
 * already shows it can't be paid, the dialog says why and offers top-up / plans instead of
 * Confirm. That's only a hint: the Edge Function decides, and a refusal there opens the credit
 * dialog (useCredits().run). Free actions (0 credits) run straight away.
 */
export function CostConfirm({
  actionKey,
  credits: creditsOverride,
  description,
  confirmLabel = "Continue",
  onConfirm,
  trigger,
  disabled,
}: {
  actionKey: string;
  credits?: number;
  /** What the credits pay for; defaults to the action's label in credit_costs. */
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  trigger: ReactElement;
  disabled?: boolean;
}) {
  const { credits: balance, costs, check } = useCredits();
  const [open, setOpen] = useState(false);
  const cost = creditsOverride ?? costs[actionKey]?.credits ?? null;
  const label = description ?? costs[actionKey]?.label ?? null;

  const verdict = cost !== null ? check(cost, actionKey) : null;
  const blocked = verdict && !verdict.ok ? creditErrorView({ code: verdict.code, details: verdict.details }) : null;

  function onOpenChange(next: boolean) {
    if (next && cost === 0) {
      onConfirm();
      return;
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} disabled={disabled} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cost !== null ? `This costs ${creditsText(cost)}` : "This uses AI credits"}</DialogTitle>
          {label && <DialogDescription>{label}</DialogDescription>}
        </DialogHeader>

        {blocked ? (
          <div className="flex flex-col gap-2" role="alert">
            <p className="font-medium">{blocked.title}</p>
            {blocked.detail && <p className="text-muted-foreground">{blocked.detail}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {balance && verdict?.ok && (
              <dl className="flex items-center gap-3 rounded-2xl bg-secondary p-4 text-secondary-foreground">
                <Coins className="size-5 shrink-0" aria-hidden />
                <div className="flex flex-1 flex-wrap justify-between gap-x-4 gap-y-1">
                  <div className="flex gap-1.5">
                    <dt>Your balance</dt>
                    <dd className="font-medium tabular-nums">{balance.balance}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt>After this</dt>
                    <dd className="font-medium tabular-nums">{verdict.balanceAfter}</dd>
                  </div>
                </div>
              </dl>
            )}
            {!balance && <p className="text-muted-foreground">We couldn&apos;t load your balance just now.</p>}
            <p className="text-muted-foreground">If it fails on our side, the credits are refunded automatically.</p>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{blocked ? "Not now" : "Cancel"}</DialogClose>
          {blocked ? (
            <CreditErrorActions actions={blocked.actions} onNavigate={() => setOpen(false)} />
          ) : (
            <Button
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
