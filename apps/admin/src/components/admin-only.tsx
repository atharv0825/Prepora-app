import { ShieldAlert } from "lucide-react";

const personalData =
  "This page shows students' personal details, so only admins can open it. Ask an admin if you need something here.";

/** Shown to staff who aren't admins (content editors) on admin-only pages, e.g. Users (M2-A1). */
export function AdminOnly({ reason = personalData }: { reason?: string }) {
  return (
    <div role="alert" className="flex max-w-xl items-start gap-4 rounded-2xl border border-border p-6">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <div className="flex flex-col gap-1">
        <h1 className="text-h3">Admins only</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
      </div>
    </div>
  );
}
