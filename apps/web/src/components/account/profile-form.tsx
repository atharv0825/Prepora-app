"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { Label } from "@prepora/ui/components/label";
import { toast } from "@prepora/ui/components/sonner";
import { type ProfileFormState, updateProfileName } from "@/lib/account-actions";

const initial: ProfileFormState = { status: "idle" };

/** Name field for the profile page (M1-F3). Validated again on the server (ProfileUpdate). */
export function ProfileForm({ defaultName, disabled }: { defaultName: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(updateProfileName, initial);

  useEffect(() => {
    if (state.status === "saved") toast.success("Name saved");
  }, [state]);

  const fieldError = state.status === "error" && state.field === "full_name" ? state.message : null;
  const formError = state.status === "error" && !state.field ? state.message : null;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="full_name">Name</Label>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={state.status === "saved" ? state.name : defaultName}
          autoComplete="name"
          maxLength={100}
          required
          disabled={disabled || pending}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? "full_name-error" : "full_name-hint"}
          className="h-11"
        />
        {fieldError ? (
          <p id="full_name-error" className="text-sm text-destructive">
            {fieldError}
          </p>
        ) : (
          <p id="full_name-hint" className="text-sm text-muted-foreground">
            Shown on your dashboard and feedback reports.
          </p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={disabled || pending} className="self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
