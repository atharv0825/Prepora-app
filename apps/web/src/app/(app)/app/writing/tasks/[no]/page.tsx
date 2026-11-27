import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, PenLine } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { FilterPills } from "@/components/practice/filter-pills";
import { PracticeHeader } from "@/components/practice/page-header";
import { PracticeCard } from "@/components/practice/practice-card";
import { PickCard } from "@/components/practice/pick-card";
import { testTypeLabel } from "@/lib/dashboard";
import { listFilter } from "@/lib/reading";
import { routes, writingTaskListPath, writingTaskPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";
import { taskKindLabel, taskNote, tasksFor, taskSummary, type TaskRow } from "@/lib/writing/writing";

export const metadata: Metadata = { title: "Writing tasks · Prepora", robots: { index: false } };

const FILTERS = [
  { value: "academic", label: "Academic" },
  { value: "general", label: "General Training" },
  { value: "all", label: "All" },
] as const;

// One Writing task's topics (/app/writing/tasks/1 or /2), opened from the Task 1 / Task 2 cards
// on the Writing home. The same Academic / General Training / All filter on top; the topics as
// 3D cards (green until written, then mint). Read through RLS: published tasks, own submissions.
export default async function WritingTaskListPage({ params, searchParams }: PageProps<"/app/writing/tasks/[no]">) {
  const { no } = await params;
  if (no !== "1" && no !== "2") notFound();
  const taskNo = Number(no) as 1 | 2;
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const filter = listFilter((await searchParams).type, account.profile?.test_type);
  const supabase = await createClient();

  const [{ data: tasks }, { data: submissions }] = await Promise.all([
    supabase.from("writing_tasks").select("id, task_no, test_type, title").eq("status", "published").eq("task_no", taskNo).order("created_at"),
    supabase.from("writing_submissions").select("id, task_id, band, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const { task1, task2 } = tasksFor((tasks ?? []) as TaskRow[], filter);
  const items = taskNo === 1 ? task1 : task2;
  const summary = taskSummary(submissions ?? []);
  const scope = taskNo === 2 || filter === "all" ? "" : `${testTypeLabel(filter)} `;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      <Link href={`${routes.writing}?type=${filter}`} data-testid="back-to-writing" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Writing
      </Link>

      <PracticeHeader
        title={`Task ${taskNo}`}
        progress={
          <CompletionBar
            module="writing"
            completed={items.filter((t) => summary.has(t.id)).length}
            total={items.length}
            noun={[`Task ${taskNo} topic`, `Task ${taskNo} topics`]}
            ariaLabel={`Task ${taskNo} topics completed`}
            testId="writing-progress"
          />
        }
      >
        <p>{taskNote(taskNo, filter)}</p>
      </PracticeHeader>

      <FilterPills filters={FILTERS} current={filter} hrefFor={(v) => writingTaskListPath(taskNo, v)} />

      <section aria-label={`Task ${taskNo} topics`}>
        {items.length === 0 ? (
          <p className="text-muted-foreground">No {scope}Task {taskNo} topics yet. New ones are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <PickCard kind={taskNo === 1 ? "writing_t1" : "writing_t2"} module="writing" note={`A Task ${taskNo} topic you haven't written yet.`} />
            </li>
            {items.map((t) => {
              const s = summary.get(t.id);
              return (
                <li key={t.id} data-testid="writing-task">
                  <PracticeCard
                    module="writing"
                    href={writingTaskPath(t.id)}
                    title={t.title}
                    kindLabel={taskKindLabel(t.task_no, t.test_type)}
                    icon={taskNo === 1 ? FileText : PenLine}
                    status={s ? `Written ${s.count} ${s.count === 1 ? "time" : "times"} · best band ${s.best.toFixed(1)}` : "Not written yet"}
                    done={!!s}
                    verbs={{ start: "Start writing", again: "Write again" }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
