import Link from "next/link";
import { ArrowUpRight, FileText, PenLine } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import { completionPercent } from "@/components/practice/completion-bar";
import { MODULE_STYLE } from "@/components/dashboard/module-style";

// Writing home: Task 1 and Task 2 side by side, styled like the dashboard's module tiles: a white
// card on the soft panel, the Writing colour on the icon, a round ↗ button, the task's format, and
// a footer (same height on both) with the topic count, how many are written and the percentage.
// Each opens its own page of topics.

const writing = MODULE_STYLE.writing;

export function TaskGroupCard({
  href,
  taskNo,
  note,
  topics,
  written,
}: {
  href: string;
  taskNo: 1 | 2;
  note: string;
  topics: number;
  written: number;
}) {
  const Icon = taskNo === 1 ? FileText : PenLine;
  const pct = completionPercent(written, topics);
  return (
    <Link
      href={href}
      aria-label={`Task ${taskNo}: ${topics} topic${topics === 1 ? "" : "s"}, ${written} written`}
      className="group flex h-full flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground shadow-xs transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-6"
      data-testid="writing-group"
    >
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className={cn("grid size-12 shrink-0 place-items-center rounded-full ring-4", writing.bg, writing.onBg, writing.ring)}>
          <Icon className="size-5" />
        </span>
        <span aria-hidden className="grid size-10 place-items-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
          <ArrowUpRight className="size-4" />
        </span>
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-medium">Task {taskNo}</span>
        <span className="text-sm text-muted-foreground">{note}</span>
      </span>
      <span className="mt-auto flex min-h-11 flex-wrap items-end justify-between gap-2 border-t border-border pt-4 text-xs">
        <span className="text-muted-foreground">
          {topics === 0 ? (
            "No topics yet"
          ) : written === 0 ? (
            <>
              <span className="font-medium text-foreground tabular-nums">{topics}</span> {topics === 1 ? "topic" : "topics"} · Not started yet
            </>
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">{topics}</span> {topics === 1 ? "topic" : "topics"} ·{" "}
              <span className="font-medium text-foreground tabular-nums">{written}</span> written
            </>
          )}
        </span>
        {topics > 0 && (
          <span className={cn("rounded-full px-2.5 py-1 font-medium tabular-nums", pct > 0 ? "bg-primary text-primary-foreground" : "bg-muted")}>{pct}%</span>
        )}
      </span>
    </Link>
  );
}
