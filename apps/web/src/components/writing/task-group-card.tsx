import Link from "next/link";
import { ArrowRight, FileText, PenLine } from "lucide-react";
import { completionPercent } from "@/components/practice/completion-bar";

// Writing home: Task 1 and Task 2 side by side as big 3D cards. Each opens its own page of topics.
// Shows the task's format, how many topics there are for the chosen test type, and how many the
// student has written, as a small bar.

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
      className="group relative flex h-full min-h-52 flex-col justify-between gap-6 rounded-3xl bg-gradient-to-b from-[#62d7a5] to-brand-primary p-6 text-brand-ink ring-1 ring-black/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-3px_0_rgb(8_34_43/0.08),0_14px_30px_-14px_rgb(15_164_103/0.8)] transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-3px_0_rgb(8_34_43/0.08),0_22px_38px_-14px_rgb(15_164_103/0.85)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-testid="writing-group"
    >
      <span className="flex items-start justify-between gap-4">
        <span className="flex items-start gap-4">
          <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-full bg-white/25 ring-1 ring-white/60">
            <Icon className="size-6" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-h2">Task {taskNo}</span>
            <span className="text-sm text-brand-ink/80">{note}</span>
          </span>
        </span>
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-ink text-white transition-transform group-hover:translate-x-1">
          <ArrowRight className="size-5" />
        </span>
      </span>

      <span className="flex flex-col gap-2">
        <span className="flex items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="text-2xl font-light tabular-nums">{topics}</span> topic{topics === 1 ? "" : "s"}
          </span>
          <span className="text-brand-ink/80">
            {written} written · {pct}%
          </span>
        </span>
        <span aria-hidden className="block h-2.5 overflow-hidden rounded-full bg-white/50 p-0.5 shadow-[inset_0_1px_2px_rgb(8_34_43/0.2)]">
          {pct > 0 && <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${pct}%` }} />}
        </span>
      </span>
    </Link>
  );
}
