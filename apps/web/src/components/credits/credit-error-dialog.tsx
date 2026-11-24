"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@prepora/ui/components/dialog";
import { type CreditError, type CreditErrorAction, type CreditErrorView, creditErrorView } from "@/lib/credits";

/**
 * M3-F3: the dialog for a credit refusal (insufficient_credits, daily_cap_reached,
 * allowance_exceeded, feature_not_in_plan). Opened by useCredits().showCreditError / run();
 * upgrade and top-up links go to a placeholder until billing (M9-F3).
 */
export function CreditErrorDialog({ error, onClose }: { error: CreditError | null; onClose: () => void }) {
  return (
    <Dialog open={error !== null} onOpenChange={(open) => !open && onClose()}>
      {error && <CreditErrorDialogContent view={creditErrorView(error)} onNavigate={onClose} />}
    </Dialog>
  );
}

function CreditErrorDialogContent({ view, onNavigate }: { view: CreditErrorView; onNavigate: () => void }) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{view.title}</DialogTitle>
        <DialogDescription>{view.body}</DialogDescription>
      </DialogHeader>
      {view.detail && <p className="text-sm">{view.detail}</p>}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Not now</DialogClose>
        <CreditErrorActions actions={view.actions} onNavigate={onNavigate} />
      </DialogFooter>
    </DialogContent>
  );
}

/** Upgrade / top-up links, primary first on the right. Shared with the cost confirm (M3-F2). */
export function CreditErrorActions({ actions, onNavigate }: { actions: CreditErrorAction[]; onNavigate?: () => void }) {
  return (
    <>
      {[...actions].reverse().map((a) => (
        <Link
          key={a.href}
          href={a.href}
          onClick={onNavigate}
          className={buttonVariants({ variant: a.primary ? "default" : "outline" })}
        >
          {a.label}
        </Link>
      ))}
    </>
  );
}
