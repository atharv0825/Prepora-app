import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { WritingFeedback } from "@prepora/shared/api/score-writing";
import { WRITING_TASKS, type WritingScores, type WritingTaskNo } from "@prepora/shared/ielts/writing";
import { WritingFeedbackView } from "@/components/writing/writing-feedback";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { routes, writingTaskPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";
import { taskKindLabel } from "@/lib/writing/writing";

export const metadata: Metadata = { title: "Writing feedback · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One scored Writing answer (M6-F3). Read through RLS: only its owner gets the row (everyone else
// gets the 404 page). The feedback is shown as stored: full for Gold/Platinum, the summary for Free.
export default async function WritingSubmissionPage({ params }: PageProps<"/app/writing/submissions/[submissionId]">) {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const { submissionId } = await params;
  if (!UUID.test(submissionId)) notFound();
  const supabase = await createClient();
  const { data: sub } = await supabase
    .from("writing_submissions")
    .select("id, task_id, input_mode, text, word_count, scores, band, feedback, created_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) notFound();
  const feedback = WritingFeedback.safeParse(sub.feedback);
  if (!feedback.success) notFound();
  // The task, if it's still published (an archived task's prompt isn't readable by students).
  const { data: task } = await supabase.from("writing_tasks").select("id, task_no, test_type, title, prompt").eq("id", sub.task_id).maybeSingle();
  // Archived tasks aren't readable by students, and submissions don't store the task number, so for
  // those it's a best guess from the length (it only picks "Task Achievement" vs "Task Response").
  const taskNo = (task?.task_no ?? (sub.word_count >= 250 ? 2 : 1)) as WritingTaskNo;
  const timeZone = validTimeZone(account.profile?.timezone);

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 pb-16">
      <Link href={routes.writing} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> All Writing
      </Link>
      <h1 className="text-h1">{task?.title ?? "Writing feedback"}</h1>
      {task && (
        <details className="rounded-2xl border border-foreground/5 bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">The task</summary>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{task.prompt}</p>
        </details>
      )}
      <WritingFeedbackView
        model={{
          taskNo,
          kindLabel: task ? taskKindLabel(task.task_no, task.test_type) : `Task ${taskNo}`,
          title: task?.title ?? "Writing",
          prompt: task?.prompt ?? null,
          text: sub.text,
          wordCount: sub.word_count,
          minWords: WRITING_TASKS[taskNo].minWords,
          scores: sub.scores as WritingScores,
          band: Number(sub.band),
          feedback: feedback.data,
          inputMode: sub.input_mode,
          date: formatDate(new Date(sub.created_at), timeZone),
        }}
      />
      {task && (
        <Link href={writingTaskPath(task.id)} className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
          Write this task again <ArrowRight />
        </Link>
      )}
    </div>
  );
}
