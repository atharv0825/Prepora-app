import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { ContentId, type ContentStatus, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { writingPublishCheck, writingTaskKind, writingTaskKindLabels } from "@prepora/shared/api/admin-writing";
import { WRITING_TASKS } from "@prepora/shared/ielts/writing";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { StatusActions } from "@/components/reading/status-actions";
import { statusBadge } from "@/components/reading/status";
import { TaskForm } from "@/components/writing/task-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Writing task" };

// M6-A1: one Writing task: status and workflow, the publish checklist, the details form (with the
// Task 1 Academic image) and a preview of what students see. Staff only (layout + RLS).
export default async function WritingTaskPage({ params }: PageProps<"/writing/[taskId]">) {
  const { taskId } = await params;
  if (!ContentId.safeParse(taskId).success) notFound();
  const supabase = await createClient();
  const { data: task, error } = await supabase
    .from("writing_tasks")
    .select("id, task_no, test_type, title, prompt, image_url, image_alt, status, updated_at")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(`writing_tasks failed: ${error.code}`);
  if (!task) notFound();
  const kind = writingTaskKind(task);
  const check = writingPublishCheck(task);
  const status = task.status as ContentStatus;
  const limits = WRITING_TASKS[task.task_no as 1 | 2];

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-col gap-3">
        <Link href="/writing" className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Writing tasks
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-h2">{task.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={statusBadge(status)} data-testid="task-status">
                {contentStatusLabels[status]}
              </Badge>
              {writingTaskKindLabels[kind]} · updated {formatDateTime(task.updated_at)}
            </p>
          </div>
          <StatusActions module="writing" testId={task.id} status={status} check={check} />
        </div>
        {status === "published" && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            This task is live. Changes reach students as soon as you save them; feedback already given isn&apos;t changed.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ready to publish?</CardTitle>
          <CardDescription>The task is checked again when you publish.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm" data-testid="publish-check">
            {check.blocking.length === 0 && (
              <li className="flex items-start gap-2 text-primary">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {kind === "t1_academic" ? "The task and its image are in place." : "The task is in place."}
              </li>
            )}
            {check.blocking.map((b) => (
              <li key={b} className="flex items-start gap-2 text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {b}
              </li>
            ))}
            {check.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            {kind === "t2" ? "Task 2 is an essay; it usually suits both tests." : kind === "t1_general" ? "A letter for General Training." : "A report on a visual for Academic."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaskForm
            taskId={task.id}
            values={{
              kind,
              t2_test_type: task.test_type ?? "both",
              title: task.title,
              prompt: task.prompt,
              image_url: task.image_url ?? "",
              image_alt: task.image_alt ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What students see</CardTitle>
          <CardDescription>The editor shows this above the answer box, with a {limits.minutes}-minute timer and a {limits.minWords}-word minimum.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4" data-testid="task-preview">
          <p className="whitespace-pre-line leading-relaxed">{task.prompt}</p>
          {task.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- any uploaded or pasted URL
            <img src={task.image_url} alt={task.image_alt ?? ""} className="max-h-96 w-auto max-w-full self-start rounded-xl border border-border bg-white" />
          )}
          <p className="text-sm text-muted-foreground">
            Spend about {limits.minutes} minutes. Write at least {limits.minWords} words.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
