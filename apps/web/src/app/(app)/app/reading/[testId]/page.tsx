import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { ReadingTestPayload } from "@prepora/shared/api/reading-test";
import { ReadingPlayer } from "@/components/reading/reading-player";
import { planLabel, testTypeLabel } from "@/lib/dashboard";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reading test · Prepora", robots: { index: false } };

// The Reading test player (M4-F2). The test comes from get_reading_test (M4-B1), which never
// returns answers or explanations: those first reach the browser in grade-test's results.
//   PT404 (unknown / unpublished / malformed id) → 404; PT403 (plan too low) → an upgrade card.
export default async function ReadingTestPage({ params }: PageProps<"/app/reading/[testId]">) {
  const { testId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_reading_test", { p_test_id: testId });

  if (error?.code === "PT403") {
    return (
      <div className="flex max-w-xl flex-col gap-4 pb-16">
        <h1 className="text-h1">This test is part of {planLabel(error.details)}</h1>
        <p className="text-muted-foreground">Upgrade to take it, or choose one of the tests in your plan.</p>
        <div className="flex flex-wrap gap-3">
          <Link href={routes.upgrade} className={buttonVariants()}>
            See plans
          </Link>
          <Link href={routes.reading} className={buttonVariants({ variant: "outline" })}>
            All Reading tests
          </Link>
        </div>
      </div>
    );
  }
  const parsed = ReadingTestPayload.safeParse(data);
  if (error || !parsed.success) notFound();
  const payload = parsed.data;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={routes.reading} className={cn("self-start text-sm text-muted-foreground underline-offset-4 hover:underline")}>
          ← Reading tests
        </Link>
        <h1 className="text-h2">{payload.test.title}</h1>
        <p className="text-sm text-muted-foreground">{testTypeLabel(payload.test.test_type)} Reading</p>
      </div>
      <ReadingPlayer payload={payload} />
    </div>
  );
}
