import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { type ContentStatus, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { NewTestForm } from "@/components/reading/new-test-form";
import { statusBadge } from "@/components/reading/status";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, titleCase } from "@/lib/users";

export const metadata: Metadata = { title: "Reading" };

// M4-A1: Reading tests, every status, newest first, with a form to start a new one. Staff only
// (the layout checks; RLS lets staff read drafts). Each test opens in the builder.
export default async function ReadingTestsPage() {
  const supabase = await createClient();
  const [{ data: tests, error }, { data: questions }] = await Promise.all([
    supabase.from("reading_tests").select("id, title, test_type, status, min_plan, source, updated_at").order("updated_at", { ascending: false }),
    supabase.from("reading_questions").select("test_id"),
  ]);
  if (error) throw new Error(`reading_tests failed: ${error.code}`);
  const counts = new Map<string, number>();
  for (const q of questions ?? []) counts.set(q.test_id, (counts.get(q.test_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <BookOpen className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Reading</h1>
          <p className="mt-1 text-muted-foreground">Build tests: 3 passages and up to 40 questions of the 11 IELTS types.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New test</CardTitle>
          <CardDescription>It starts as a draft. Students see it only once you publish it.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewTestForm module="reading" />
        </CardContent>
      </Card>

      <section aria-labelledby="tests-heading" className="flex flex-col gap-4">
        <h2 id="tests-heading" className="text-h3">
          Tests
        </h2>
        {(tests ?? []).length === 0 ? (
          <p className="text-muted-foreground">No tests yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="reading-tests">
            {(tests ?? []).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/reading/${t.id}`}
                  className="flex flex-col gap-1.5 px-4 py-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-medium">{t.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {t.test_type === "academic" ? "Academic" : "General Training"} · {counts.get(t.id) ?? 0} questions · updated{" "}
                      {formatDateTime(t.updated_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {t.source === "ai" && <Badge variant="outline">AI</Badge>}
                    {t.min_plan !== "free" && <Badge variant="outline">{titleCase(t.min_plan)}</Badge>}
                    <Badge variant={statusBadge(t.status as ContentStatus)}>{contentStatusLabels[t.status as ContentStatus]}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
