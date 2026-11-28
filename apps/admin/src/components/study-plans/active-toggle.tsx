"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@prepora/ui/components/button";
import { toast } from "@prepora/ui/components/sonner";
import { setStudyTemplateActive } from "@/lib/study-plan-actions";

/**
 * Activate (new students can get it; needs full coverage of what's saved) or deactivate (no new
 * students; those on it keep it). `blocked`: why it can't be activated, if it can't.
 */
export function ActiveToggle({ id, active, blocked }: { id: string; active: boolean; blocked: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (to: boolean) =>
    start(async () => {
      const r = await setStudyTemplateActive(id, to);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.message);
    });

  return (
    <div className="flex flex-col items-start gap-1.5 lg:items-end">
      {active ? (
        <Button variant="outline" onClick={() => set(false)} disabled={pending} data-testid="deactivate-template">
          {pending ? "Deactivating…" : "Deactivate"}
        </Button>
      ) : (
        <Button onClick={() => set(true)} disabled={pending || blocked !== null} data-testid="activate-template">
          {pending ? "Activating…" : "Activate"}
        </Button>
      )}
      {!active && blocked && <span className="max-w-xs text-xs text-muted-foreground lg:text-right">{blocked}</span>}
    </div>
  );
}
