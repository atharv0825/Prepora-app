import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { AdminListeningTest, listeningPublishCheck } from "@prepora/shared/api/admin-listening";
import { ContentId, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { SectionEditor } from "@/components/listening/section-editor";
import { QuestionList } from "@/components/reading/question-list";
import { StatusActions } from "@/components/reading/status-actions";
import { statusBadge } from "@/components/reading/status";
import { TestDetailsForm } from "@/components/reading/test-details-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Listening builder" };

// M5-A1: the Listening builder. Test details → 4 sections, each with its recording (uploaded to
// R2 with progress), transcript and up to 10 questions (13 types; map and diagram labelling with
// images) → publish. Loaded through admin_get_listening_test (staff only), keys and transcripts
// included; every save re-renders this page.
export default async function ListeningBuilderPage({ params }: PageProps<"/listening/[testId]">) {
  const { testId } = await params;
  if (!ContentId.safeParse(testId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_listening_test", { p_test_id: testId });
  if (error?.code === "P0002") notFound();
  if (error) throw new Error(`admin_get_listening_test failed: ${error.code}`);
  const { test, sections, questions } = AdminListeningTest.parse(data);
  const check = listeningPublishCheck({ sections, questions });
  const byOrder = new Map(sections.map((s) => [s.order_no, s]));

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-col gap-3">
        <Link href="/listening" className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Listening tests
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-h2">{test.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={statusBadge(test.status)} data-testid="test-status">
                {contentStatusLabels[test.status]}
              </Badge>
              {questions.length} of 40 questions · updated {formatDateTime(test.updated_at)}
            </p>
          </div>
          <StatusActions module="listening" testId={test.id} status={test.status} check={check} />
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
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> 4 sections with recordings and transcripts, questions in order,
                every answer key valid.
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
          <CardDescription>One Listening test serves Academic and General Training. Only the minimum plan and above can take it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TestDetailsForm module="listening" testId={test.id} details={{ title: test.title, min_plan: test.min_plan }} />
        </CardContent>
      </Card>

      {[1, 2, 3, 4].map((n) => {
        const section = byOrder.get(n);
        const own = section ? questions.filter((q) => q.section_id === section.id) : [];
        return (
          <Card key={n} data-testid={`section-${n}`}>
            <CardHeader>
              <CardTitle>Section {n}</CardTitle>
              <CardDescription>
                Questions {(n - 1) * 10 + 1}–{n * 10}
                {section ? ` · ${own.length} of 10 written` : " · save the section, then upload its recording and add questions"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              <SectionEditor key={section?.updated_at ?? "new"} testId={test.id} orderNo={n} section={section} />
              {section && (
                <section aria-label={`Section ${n} questions`} className="flex flex-col gap-3 border-t border-border pt-6">
                  <h3 className="font-semibold">Questions</h3>
                  <QuestionList
                    module="listening"
                    testId={test.id}
                    parentId={section.id}
                    questions={own}
                    canAdd={own.length < 10}
                    fullText="10 questions: this section is full."
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
