import type { ContentStatus } from "@prepora/shared/api/admin-reading";

/** Badge colour per content status. */
export function statusBadge(status: ContentStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "published") return "default";
  if (status === "review") return "secondary";
  if (status === "archived") return "destructive";
  return "outline";
}

export const selectClass =
  "h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive";
