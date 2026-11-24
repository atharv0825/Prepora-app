"use client";

import { useActionState, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { CREDIT_COST_MAX } from "@prepora/shared/api/admin-credits";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { type ActionState, updateCreditCost } from "@/lib/credit-actions";
import { costNote, underBudget } from "@/lib/credits";
import { submitKeepingInput } from "./form-submit";

/**
 * The credits one AI action costs (M3-A1). Takes effect on the next spend: spend_credits and the
 * student's "This costs N credits" both read credit_costs. Shows the budget (1 credit ≈ $0.01)
 * against the estimated AI cost while typing, and warns when the price no longer covers it.
 */
export function CreditCostForm({
  actionKey,
  label,
  credits,
  estCostUsd,
}: {
  actionKey: string;
  label: string;
  credits: number;
  estCostUsd: number | null;
}) {
  const [value, setValue] = useState(String(credits));
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await updateCreditCost(prev, form);
    if (result.ok) toast.success(`${label}: ${result.message}`);
    else toast.error(`${label}: ${result.message}`);
    return result;
  }, { ok: true, message: "" });

  const typed = /^\d+$/.test(value) ? Number(value) : null;
  const inputId = `cost-${actionKey}`;
  const low = typed !== null && underBudget(typed, estCostUsd);

  return (
    <form onSubmit={submitKeepingInput(action)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <input type="hidden" name="action_key" value={actionKey} />
      <label htmlFor={inputId} className="sr-only">
        Credits for {label}
      </label>
      <Input
        id={inputId}
        name="credits"
        type="number"
        inputMode="numeric"
        min={0}
        max={CREDIT_COST_MAX}
        step={1}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={!state.ok || undefined}
        aria-describedby={`${inputId}-note`}
        className="h-9 w-20 tabular-nums"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending || typed === credits}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <span id={`${inputId}-note`} className={low ? "flex basis-full items-center gap-1 text-xs text-destructive" : "basis-full text-xs text-muted-foreground"}>
        {low && <TriangleAlert className="size-3.5" aria-hidden />}
        {typed === null ? "Enter whole credits" : costNote(typed, estCostUsd)}
        {low && " (below cost)"}
      </span>
    </form>
  );
}
