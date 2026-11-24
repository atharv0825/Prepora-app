"use client";

import { useActionState } from "react";
import { PLAN_COUNT_MAX } from "@prepora/shared/api/admin-credits";
import { type PlanLimits, planFeatures } from "@prepora/shared/api/credits";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { type ActionState, updatePlan } from "@/lib/credit-actions";
import { planCountFields, planFeatureLabels } from "@/lib/credits";
import { submitKeepingInput } from "./form-submit";

/**
 * One plan's limits (M3-A1), saved by a Server Function: every field is sent (plans.limits is
 * replaced as a whole); the database validates it and audits the keys that changed.
 */
export function PlanForm({ id, name, limits }: { id: string; name: string; limits: PlanLimits }) {
  const [state, action, pending] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await updatePlan(prev, form);
    if (result.ok) toast.success(`${name} plan: ${result.message}`);
    else toast.error(`${name} plan: ${result.message}`);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-6" aria-label={`${name} plan limits`}>
      <input type="hidden" name="plan_id" value={id} />
      {planCountFields.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-3">
          <legend className="mb-1 font-medium">{group.title}</legend>
          <p className="-mt-1 text-xs text-muted-foreground">{group.note}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.fields.map((f) => {
              const inputId = `${id}-${f.key}`;
              const error = errors[f.key];
              return (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <label htmlFor={inputId} className="text-sm font-medium">
                    {f.label}
                  </label>
                  <Input
                    id={inputId}
                    name={f.key}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={PLAN_COUNT_MAX}
                    step={1}
                    required
                    defaultValue={limits[f.key]}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={`${inputId}-hint`}
                    className="h-10 tabular-nums"
                  />
                  <span id={`${inputId}-hint`} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
                    {error ?? f.hint}
                  </span>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 font-medium">Features</legend>
        {planFeatures.map((key) => (
          <label key={key} className="flex items-center gap-3 text-sm">
            <input type="checkbox" name={key} defaultChecked={limits[key]} className="size-4 accent-primary" />
            {planFeatureLabels[key]}
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : `Save ${name}`}
        </Button>
        {!state.ok && state.message && (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
