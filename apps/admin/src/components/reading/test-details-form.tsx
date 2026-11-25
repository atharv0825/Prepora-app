"use client";

import { useActionState } from "react";
import { plans } from "@prepora/shared/types/profile";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { type BuilderState, createReadingTest, updateReadingTest } from "@/lib/reading-actions";
import { titleCase } from "@/lib/users";
import { submitKeepingInput } from "../form-submit";
import { selectClass } from "./status";

type Details = { title: string; test_type: "academic" | "general"; min_plan: string };

/**
 * Title, Academic / General Training, and the lowest plan that can take the test (M4-A1).
 * Without a test id it creates a new draft and opens it in the builder.
 */
export function TestDetailsForm({ testId, details }: { testId?: string; details?: Details }) {
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = testId ? await updateReadingTest(prev, form) : await createReadingTest(prev, form);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `${testId ?? "new"}-${name}`;

  return (
    <form onSubmit={submitKeepingInput(action)} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end" aria-label="Test details">
      {testId && <input type="hidden" name="test_id" value={testId} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("title")} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={details?.title}
          placeholder="Academic Test 3"
          aria-invalid={errors.title ? true : undefined}
          className="h-11"
        />
        {errors.title && <span className="text-xs text-destructive">{errors.title}</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("type")} className="text-sm font-medium">
          Type
        </label>
        <select id={id("type")} name="test_type" defaultValue={details?.test_type ?? "academic"} className={selectClass}>
          <option value="academic">Academic</option>
          <option value="general">General Training</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id("plan")} className="text-sm font-medium">
          Minimum plan
        </label>
        <select id={id("plan")} name="min_plan" defaultValue={details?.min_plan ?? "free"} className={selectClass}>
          {plans.map((p) => (
            <option key={p} value={p}>
              {titleCase(p)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? "Saving…" : testId ? "Save details" : "Create test"}
      </Button>
    </form>
  );
}
