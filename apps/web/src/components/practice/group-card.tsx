import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { DashboardModuleKey } from "@prepora/shared/api/dashboard";
import { cn } from "@prepora/ui/lib/utils";
import { MODULE_STYLE } from "@/components/dashboard/module-style";
import { completionPercent } from "./completion-bar";

// A group of practice items as a tile (Writing: Task 1 / Task 2; Speaking: Part 1 / Part 2), styled
// like the dashboard's module tiles: a white card on the soft panel, the module's colour on the
// icon, a round ↗ button, a short description, and a footer (the same height on every tile) with
// the count, how many are done and the percentage. It opens the group's own page.

export function GroupCard({
  href,
  title,
  note,
  icon: Icon,
  module,
  noun,
  total,
  done,
  doneWord,
  testId,
}: {
  href: string;
  title: string;
  note: string;
  icon: LucideIcon;
  module: DashboardModuleKey;
  /** ["topic", "topics"], ["cue card", "cue cards"]… */
  noun: [string, string];
  total: number;
  done: number;
  /** "written", "answered" */
  doneWord: string;
  testId: string;
}) {
  const style = MODULE_STYLE[module];
  const pct = completionPercent(done, total);
  const count = (n: number) => (n === 1 ? noun[0] : noun[1]);
  return (
    <Link
      href={href}
      aria-label={`${title}: ${total} ${count(total)}, ${done} ${doneWord}`}
      className="group flex h-full flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground shadow-xs transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6"
      data-testid={testId}
    >
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn("grid size-12 shrink-0 place-items-center rounded-full ring-4", style.bg, style.onBg, style.ring)}>
          <Icon className="size-5" />
        </span>
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
          <ArrowUpRight className="size-4" />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{note}</span>
      </span>
      <span className="mt-auto flex min-h-11 flex-wrap items-end justify-between gap-2 border-t border-border pt-4 text-xs">
        <span className="text-muted-foreground">
          {total === 0 ? (
            `No ${noun[1]} yet`
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">{total}</span> {count(total)} ·{" "}
              {done === 0 ? (
                "Not started yet"
              ) : (
                <>
                  <span className="font-medium text-foreground tabular-nums">{done}</span> {doneWord}
                </>
              )}
            </>
          )}
        </span>
        {total > 0 && (
          <span className={cn("rounded-full px-2.5 py-1 font-medium tabular-nums", pct > 0 ? "bg-primary text-primary-foreground" : "bg-muted")}>{pct}%</span>
        )}
      </span>
    </Link>
  );
}
