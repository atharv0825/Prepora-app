"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";
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
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { setManualPlan } from "@/lib/billing-actions";
import type { ActionState } from "@/lib/credit-actions";
import { submitKeepingInput } from "./form-submit";

// M9-A1: give a student Gold or Platinum by hand (a support case: paid another way, a webhook
// that never arrived, goodwill), or end such a plan. Paid provider subscriptions aren't touched.

const selectClass =
  "h-11 w-full rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const initial: ActionState = { ok: true, message: "" };

export function ManualPlanDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState("gold");
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await setManualPlan(prev, form);
    if (result.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, initial);
  const errors = state.fieldErrors ?? {};
  const free = plan === "free";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" data-testid="manual-plan" />}>
        <CalendarClock aria-hidden /> Change plan
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Change plan by hand</DialogTitle>
            <DialogDescription>
              For {userName}. A manual plan ends on its date and never charges them. A subscription they pay for isn&apos;t changed: they cancel it themselves.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="user_id" value={userId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manual-plan" className="text-sm font-medium">
                Plan
              </label>
              <select id="manual-plan" name="plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={selectClass}>
                <option value="gold">Gold</option>
                <option value="platinum">Platinum</option>
                <option value="free">Free (end the manual plan)</option>
              </select>
            </div>
            {!free && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="manual-days" className="text-sm font-medium">
                  Days
                </label>
                <Input
                  id="manual-days"
                  name="days"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={366}
                  step={1}
                  defaultValue={30}
                  required
                  aria-invalid={errors.days ? true : undefined}
                  className="tabular-nums"
                />
                {errors.days && <span className="text-xs text-destructive">{errors.days}</span>}
              </div>
            )}
          </div>

          {!free && (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="grant_credits" defaultChecked className="mt-0.5 size-4 accent-primary" />
              <span>
                Also give the plan&apos;s monthly credits
                <span className="block text-xs text-muted-foreground">Valid until the plan ends, at most a month.</span>
              </span>
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-note" className="text-sm font-medium">
              Note
            </label>
            <Textarea
              id="manual-note"
              name="note"
              required
              maxLength={500}
              placeholder="Why, and the support ticket if there is one"
              aria-invalid={errors.note ? true : undefined}
              className="min-h-20"
            />
            <span className={errors.note ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {errors.note ?? "Saved in the audit log with your name."}
            </span>
          </div>

          {!state.ok && state.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : free ? "End manual plan" : "Give plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
