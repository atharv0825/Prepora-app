import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminReadingTest, ContentId, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { Badge } from "@prepora/ui/components/badge";
import { statusBadge } from "@/components/reading/status";
import { TestPreview } from "@/components/reading/test-preview";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reading preview" };

// M4-A1: preview a Reading test as a student would see it, drafts included. Staff only.
export default async function ReadingPreviewPage({ params }: PageProps<"/reading/[testId]/preview">) {
  const { testId } = await params;
  if (!ContentId.safeParse(testId).success) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_reading_test", { p_test_id: testId });
  if (error?.code === "P0002") notFound();
  if (error) throw new Error(`admin_get_reading_test failed: ${error.code}`);
  const test = AdminReadingTest.parse(data);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/reading/${test.test.id}`} className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Back to the builder
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-h2">
          {test.test.title}
          <Badge variant={statusBadge(test.test.status)}>{contentStatusLabels[test.test.status]}</Badge>
        </h1>
        <p className="text-sm text-muted-foreground">
          Preview: what a student sees. Answer the questions and check them; nothing is saved and no test allowance is used.
        </p>
      </div>
      <TestPreview data={test} />
    </div>
  );
}
