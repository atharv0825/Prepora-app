import type { Metadata } from "next";
import Link from "next/link";
import { Camera, FileText, PenLine } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { FilterSelect } from "@/components/practice/filter-select";
import { PracticeHeader } from "@/components/practice/page-header";
import { GroupCard } from "@/components/practice/group-card";
import { BandTrend } from "@/components/writing/band-trend";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { listFilter } from "@/lib/reading";
import { filterHrefs, routes, writingSubmissionPath, writingTaskListPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";
import { bandTrend, recentAverage, taskNote, tasksFor, taskSummary, type TaskRow } from "@/lib/writing/writing";

export const metadata: Metadata = { title: "Writing · Prepora", robots: { index: false } };

const FILTERS = [
  { value: "academic", label: "Academic" },
  { value: "general", label: "General Training" },
  { value: "all", label: "All" },
] as const;

// Writing home (M6-F1, M6-F4): published tasks (Task 1 by the student's test, Task 2 essays for
// both), what scoring costs, and the student's scored answers with their band trend. Read through
// RLS: published tasks, the student's own submissions.
export default async function WritingListPage({ searchParams }: PageProps<"/app/writing">) {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const { profile } = account;
  const filter = listFilter((await searchParams).type, profile?.test_type);
  const timeZone = validTimeZone(profile?.timezone);
  const supabase = await createClient();

  const [{ data: tasks }, { data: submissions }, { data: costs }] = await Promise.all([
    supabase.from("writing_tasks").select("id, task_no, test_type, title").eq("status", "published").order("created_at"),
    supabase.from("writing_submissions").select("id, task_id, band, word_count, input_mode, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("credit_costs").select("action_key, credits").in("action_key", ["writing_t1", "writing_t2", "ocr"]),
  ]);

  const allTasks = (tasks ?? []) as TaskRow[];
  const { task1, task2 } = tasksFor(allTasks, filter);
  const rows = submissions ?? [];
  const summary = taskSummary(rows);
  const cost = (key: string) => costs?.find((c) => c.action_key === key)?.credits;
  // Titles for the history, including tasks no longer published.
  const taskOf = new Map(allTasks.map((t) => [t.id, t]));
  const missing = [...new Set(rows.map((r) => r.task_id))].filter((id) => !taskOf.has(id));
  if (missing.length) {
    const { data } = await supabase.from("writing_tasks").select("id, task_no, test_type, title").in("id", missing);
    for (const t of (data ?? []) as TaskRow[]) taskOf.set(t.id, t);
  }
  const labelOf = (taskId: string) => {
    const t = taskOf.get(taskId);
    return t ? `Task ${t.task_no}` : "Writing";
  };
  const trend = bandTrend(rows).map((p) => ({
    id: p.id,
    band: p.band,
    date: formatDate(new Date(p.at), timeZone),
    label: taskOf.get(rows.find((r) => r.id === p.id)!.task_id)?.title ?? "Writing task",
  }));
  const average = recentAverage(rows);
  const t1Cost = cost("writing_t1");
  const t2Cost = cost("writing_t2");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      {/* Completed = tasks written at least once, out of the tasks shown (adjusts by itself). */}
      <PracticeHeader
        title="Writing"
        controls={<FilterSelect filters={FILTERS} current={filter} hrefs={filterHrefs(routes.writing)} />}
        progress={
          <CompletionBar
            module="writing"
            completed={[...task1, ...task2].filter((t) => summary.has(t.id)).length}
            total={task1.length + task2.length}
            noun={["Writing task", "Writing tasks"]}
            ariaLabel="Writing tasks completed"
            testId="writing-progress"
          />
        }
      >
        <p>
          Write Task 1 and Task 2 on the clock, by typing or on paper, and get a band for each criterion with corrections.
          {t1Cost !== undefined && t2Cost !== undefined && (
            <> Scoring costs {t1Cost === t2Cost ? `${t1Cost} credits` : `${t1Cost} credits for Task 1 and ${t2Cost} for Task 2`}.</>
          )}
        </p>
      </PracticeHeader>


      {/* Task 1 and Task 2 side by side; each opens its own page of topics (same filter). */}
      <section aria-label="Tasks" className="grid gap-3 rounded-[2rem] bg-muted p-3 sm:gap-4 sm:p-4 md:grid-cols-2">
        {([1, 2] as const).map((no) => {
          const items = no === 1 ? task1 : task2;
          return (
            <GroupCard
              key={no}
              href={writingTaskListPath(no, filter)}
              title={`Task ${no}`}
              note={taskNote(no, filter)}
              icon={no === 1 ? FileText : PenLine}
              module="writing"
              noun={["topic", "topics"]}
              total={items.length}
              done={items.filter((t) => summary.has(t.id)).length}
              doneWord="written"
              testId="writing-group"
            />
          );
        })}
      </section>

      <section aria-label="Your Writing" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-h2">Your band trend</h2>
          {average !== null && (
            <p className="text-sm text-muted-foreground" data-testid="recent-average">
              Average of your last {Math.min(5, rows.length)}: <span className="font-semibold text-foreground">{average.toFixed(1)}</span>
            </p>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scored answers yet. Your bands will show here as a trend.</p>
        ) : (
          <div className="rounded-3xl border border-foreground/5 bg-card p-4 sm:p-5">
            <BandTrend points={trend} />
          </div>
        )}

        {rows.length > 0 && (
          <ul className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card" aria-label="Your scored answers">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={writingSubmissionPath(r.id)} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-secondary/40">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{taskOf.get(r.task_id)?.title ?? "A task no longer available"}</span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      {formatDate(new Date(r.created_at), timeZone)} · {labelOf(r.task_id)} · {r.word_count} words
                      {r.input_mode === "photo" && (
                        <>
                          {" "}
                          · <Camera className="size-3.5" aria-label="from a photo" />
                        </>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">{Number(r.band).toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
