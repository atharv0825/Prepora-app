"use client";

import { useState, useTransition } from "react";
import type { ContentStatus, PublishCheck } from "@prepora/shared/api/admin-reading";
import { Button } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@prepora/ui/components/dialog";
import { toast } from "@prepora/ui/components/sonner";
import { deleteReadingTest, setReadingTestStatus } from "@/lib/reading-actions";

type Confirm = { kind: "status"; to: ContentStatus } | { kind: "delete" };

/**
 * The test's workflow buttons (M4-A1): draft → in review → published, back to draft, archive,
 * delete (drafts only). Publishing is offered only when the checklist has nothing blocking, and
 * the server runs the same checklist again.
 */
export function StatusActions({ testId, status, check }: { testId: string; status: ContentStatus; check: PublishCheck }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  function run(c: Confirm) {
    start(async () => {
      const result = c.kind === "delete" ? await deleteReadingTest(testId) : await setReadingTestStatus(testId, c.to);
      setConfirm(null);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  const canPublish = check.blocking.length === 0;
  const text: Record<string, { title: string; body: string; action: string }> = {
    published: {
      title: "Publish this test?",
      body: "Students on the chosen plan can take it straight away. You can still edit it, and edits go live immediately.",
      action: "Publish",
    },
    draft: {
      title: "Move back to draft?",
      body: "Students can't open it any more; anyone partway through loses access. Their past results are kept.",
      action: "Move to draft",
    },
    archived: {
      title: "Archive this test?",
      body: "Students can't see it any more. Their past results are kept. You can publish it again later.",
      action: "Archive",
    },
    delete: { title: "Delete this draft?", body: "The test, its passages and questions are deleted for good.", action: "Delete" },
  };
  const shown = confirm ? text[confirm.kind === "delete" ? "delete" : confirm.to] : null;

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "published" && (
        <Button
          disabled={pending || !canPublish}
          onClick={() => setConfirm({ kind: "status", to: "published" })}
          title={canPublish ? undefined : "Fix the checklist first"}
        >
          Publish
        </Button>
      )}
      {status === "draft" && (
        <Button variant="outline" disabled={pending} onClick={() => run({ kind: "status", to: "review" })}>
          Send for review
        </Button>
      )}
      {(status === "published" || status === "review" || status === "archived") && (
        <Button variant="outline" disabled={pending} onClick={() => setConfirm({ kind: "status", to: "draft" })}>
          Move to draft
        </Button>
      )}
      {status === "published" && (
        <Button variant="outline" disabled={pending} onClick={() => setConfirm({ kind: "status", to: "archived" })}>
          Archive
        </Button>
      )}
      {status !== "published" && (
        <Button variant="ghost" className="text-destructive" disabled={pending} onClick={() => setConfirm({ kind: "delete" })}>
          Delete
        </Button>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{shown?.title}</DialogTitle>
            <DialogDescription>{shown?.body}</DialogDescription>
          </DialogHeader>
          {confirm?.kind === "status" && confirm.to === "published" && check.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {check.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant={confirm?.kind === "delete" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => confirm && run(confirm)}
            >
              {pending ? "Working…" : shown?.action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
