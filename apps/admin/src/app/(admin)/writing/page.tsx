import type { Metadata } from "next";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { type ContentStatus, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { writingTaskKind, writingTaskKindLabels, writingTaskKinds } from "@prepora/shared/api/admin-writing";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { statusBadge } from "@/components/reading/status";
import { TaskForm } from "@/components/writing/task-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Writing" };

// M6-A1: Writing tasks, every status, grouped by kind (Task 1 Academic, Task 1 General, Task 2),
// with a form to start a new one. Staff only (the layout checks; RLS lets staff read drafts).
export default async function WritingTasksPage() {
  const supabase = await createClient();
  const { data: tasks, error } = await supabase
    .from("writing_tasks")
    .select("id, task_no, test_type, title, status, source, image_url, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`writing_tasks failed: ${error.code}`);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <PenLine className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Writing</h1>
          <p className="mt-1 text-muted-foreground">Task 1 reports (with their chart) and letters, and Task 2 essay prompts.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New task</CardTitle>
          <CardDescription>It starts as a draft. Students see it only once you publish it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TaskForm />
        </CardContent>
      </Card>

      {writingTaskKinds.map((kind) => {
        const list = (tasks ?? []).filter((t) => writingTaskKind(t) === kind);
        return (
          <section key={kind} aria-label={writingTaskKindLabels[kind]} className="flex flex-col gap-4">
            <h2 className="text-h3">{writingTaskKindLabels[kind]}</h2>
            {list.length === 0 ? (
              <p className="text-muted-foreground">No tasks yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-2xl border border-border" data-testid={`writing-tasks-${kind}`}>
                {list.map((t) => (
                  <li key={t.id}>
                    <Link href={`/writing/${t.id}`} className="flex flex-col gap-1.5 px-4 py-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between">
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {kind === "t2" ? (t.test_type ? `${t.test_type === "academic" ? "Academic" : "General Training"} only · ` : "Both tests · ") : ""}
                          {kind === "t1_academic" && !t.image_url ? "No image yet · " : ""}
                          updated {formatDateTime(t.updated_at)}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {t.source === "ai" && <Badge variant="outline">AI</Badge>}
                        <Badge variant={statusBadge(t.status as ContentStatus)}>{contentStatusLabels[t.status as ContentStatus]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
