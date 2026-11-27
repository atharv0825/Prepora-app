import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, Eye, TriangleAlert } from "lucide-react";
import { AdminReadingTest, ContentId, contentStatusLabels, publishCheck } from "@prepora/shared/api/admin-reading";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { PassageEditor } from "@/components/reading/passage-editor";
import { QuestionList } from "@/components/reading/question-list";
import { ImportButtons, ReadingImport } from "@/components/reading/reading-import";
import { StatusActions } from "@/components/reading/status-actions";
import { statusBadge } from "@/components/reading/status";
import { TestDetailsForm } from "@/components/reading/test-details-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Reading builder" };

// M4-A1: the Reading builder. Test details → 3 passages → each passage's questions (a form per
// type) → preview as a student → publish. Loaded through admin_get_reading_test (staff only),
// which includes the answer keys; every save re-renders this page. "Import" (Paste content /
// Upload document) fills the same passages and questions from a draft, after a preview.
export default async function ReadingBuilderPage({ params }: PageProps<"/reading/[testId]">) {
  const { testId } = await params;
  if (!ContentId.safeParse(testId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_reading_test", { p_test_id: testId });
  if (error?.code === "P0002") notFound();
  if (error) throw new Error(`admin_get_reading_test failed: ${error.code}`);
  const { test, passages, questions } = AdminReadingTest.parse(data);
  const check = publishCheck({ passages, questions });
  const byOrder = new Map(passages.map((p) => [p.order_no, p]));

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-col gap-3">
        <Link href="/reading" className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Reading tests
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-h2">{test.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={statusBadge(test.status)} data-testid="test-status">
                {contentStatusLabels[test.status]}
              </Badge>
              {test.test_type === "academic" ? "Academic" : "General Training"} · {questions.length} of 40 questions · updated{" "}
              {formatDateTime(test.updated_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/reading/${test.id}/preview`} className={buttonVariants({ variant: "outline" })}>
              <Eye /> Preview as student
            </Link>
            <StatusActions testId={test.id} status={test.status} check={check} />
          </div>
        </div>
        {test.status === "published" && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            This test is live. Changes reach students as soon as you save them; results already given aren&apos;t changed.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ready to publish?</CardTitle>
          <CardDescription>The test is checked again when you publish.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm" data-testid="publish-check">
            {check.blocking.length === 0 && (
              <li className="flex items-start gap-2 text-primary">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> 3 passages, questions numbered in order, every answer key valid.
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
          <CardDescription>Everyone sees the test in the list; only the minimum plan and above can take it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TestDetailsForm testId={test.id} details={{ title: test.title, test_type: test.test_type, min_plan: test.min_plan }} />
        </CardContent>
      </Card>

      <ReadingImport
        testId={test.id}
        testType={test.test_type}
        existingQuestions={questions.length}
        existingPassages={passages.map((p) => p.order_no)}
      />

      {[1, 2, 3].map((n) => {
        const passage = byOrder.get(n);
        const own = passage ? questions.filter((q) => q.passage_id === passage.id) : [];
        return (
          <Card key={n} data-testid={`passage-${n}`}>
            <CardHeader>
              <CardTitle>Passage {n}</CardTitle>
              <CardDescription>
                {passage
                  ? own.length
                    ? `Questions ${own[0]!.q_no}–${own[own.length - 1]!.q_no}`
                    : "No questions yet"
                  : "Save the passage, then add its questions."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              <PassageEditor
                key={passage?.updated_at ?? "new"}
                testId={test.id}
                orderNo={n}
                passage={passage}
                extraActions={<ImportButtons passage={n} />}
              />
              {passage && (
                <section aria-label={`Passage ${n} questions`} className="flex flex-col gap-3 border-t border-border pt-6">
                  <h3 className="font-semibold">Questions</h3>
                  <QuestionList
                    testId={test.id}
                    parentId={passage.id}
                    questions={own}
                    canAdd={questions.length < 40}
                    fullText="40 questions: the test is full."
                    extraActions={<ImportButtons passage={n} />}
                  />
                </section>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
