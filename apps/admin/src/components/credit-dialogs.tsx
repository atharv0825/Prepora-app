"use client";

import { useActionState, useState } from "react";
import { Gift, Undo2 } from "lucide-react";
import { GRANT_MAX, NOTE_MAX, grantExpiryOptions } from "@prepora/shared/api/admin-credits";
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
import { type ActionState, grantCredits, refundCredits } from "@/lib/credit-actions";
import { submitKeepingInput } from "./form-submit";

// M3-A2: support actions on a user's credits. Both need a note (why, ticket number), which is
// stored in audit_log with the admin's id. The database checks is_admin() and the limits again.

const selectClass =
  "h-11 w-full rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const initial: ActionState = { ok: true, message: "" };

function useCreditAction(run: (prev: ActionState, form: FormData) => Promise<ActionState>, onDone: () => void) {
  return useActionState(async (prev: ActionState, form: FormData) => {
    const result = await run(prev, form);
    if (result.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, initial);
}

function FieldHint({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (!error && !hint) return null;
  return (
    <span id={id} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
      {error ?? hint}
    </span>
  );
}

function FormError({ state }: { state: ActionState }) {
  return !state.ok && state.message ? (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  ) : null;
}

export function GrantCreditsDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useCreditAction(grantCredits, () => setOpen(false));
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Gift aria-hidden /> Grant credits
      </DialogTrigger>
      <DialogContent>
        {/* Remounted on each open (DialogContent unmounts when closed), so the form starts empty. */}
        <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Grant credits</DialogTitle>
            <DialogDescription>
              To {userName}. They&apos;re added as a new bucket and spent like any other credits.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="user_id" value={userId} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-amount" className="text-sm font-medium">
                Credits
              </label>
              <Input
                id="grant-amount"
                name="amount"
                type="number"
                inputMode="numeric"
                min={1}
                max={GRANT_MAX}
                step={1}
                required
                autoFocus
                aria-invalid={errors.amount ? true : undefined}
                aria-describedby="grant-amount-hint"
                className="tabular-nums"
              />
              <FieldHint id="grant-amount-hint" error={errors.amount} hint={`1 to ${GRANT_MAX}`} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="grant-expiry" className="text-sm font-medium">
                Expires
              </label>
              <select id="grant-expiry" name="expires_in_days" defaultValue="90" className={selectClass}>
                {grantExpiryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="grant-note" className="text-sm font-medium">
              Note
            </label>
            <Textarea
              id="grant-note"
              name="note"
              required
              maxLength={NOTE_MAX}
              placeholder="Why, and the support ticket if there is one"
              aria-invalid={errors.note ? true : undefined}
              aria-describedby="grant-note-hint"
              className="min-h-20"
            />
            <FieldHint id="grant-note-hint" error={errors.note} hint="Saved in the audit log with your name." />
          </div>

          <FormError state={state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Granting…" : "Grant credits"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RefundDialog({
  userId,
  reservationId,
  label,
  credits,
  when,
}: {
  userId: string;
  reservationId: string;
  label: string;
  credits: number;
  when: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useCreditAction(refundCredits, () => setOpen(false));
  const errors = state.fieldErrors ?? {};
  const noteId = `refund-note-${reservationId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" className="h-8 px-3" aria-label={`Refund ${label}, ${when}`} />}>
        <Undo2 aria-hidden /> Refund
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>
              Refund {credits} {credits === 1 ? "credit" : "credits"}?
            </DialogTitle>
            <DialogDescription>
              {label}, {when}. The credits go back to the buckets they came from. If a bucket has expired since, its
              share stays unusable: grant credits instead.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="user_id" value={userId} />
          <input type="hidden" name="reservation_id" value={reservationId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor={noteId} className="text-sm font-medium">
              Note
            </label>
            <Textarea
              id={noteId}
              name="note"
              required
              autoFocus
              maxLength={NOTE_MAX}
              placeholder="Why, and the support ticket if there is one"
              aria-invalid={errors.note ? true : undefined}
              aria-describedby={`${noteId}-hint`}
              className="min-h-20"
            />
            <FieldHint id={`${noteId}-hint`} error={errors.note} hint="Saved in the audit log with your name." />
          </div>

          <FormError state={state} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Refunding…" : `Refund ${credits} ${credits === 1 ? "credit" : "credits"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
