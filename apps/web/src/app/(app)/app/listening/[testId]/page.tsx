import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@prepora/ui/components/button";
import { ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { LiveListeningTest } from "@/components/listening/live-listening-test";
import { planLabel } from "@/lib/dashboard";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Listening test · Prepora", robots: { index: false } };

// A published Listening test (M5-I1 takes one end to end): get_listening_test (M5-B2) gives the
// sections with their recordings and the questions, never answers or transcripts; grade-test
// marks it. PT404 (unknown / unpublished) → 404; PT403 (plan too low) → an upgrade card.
export default async function ListeningTestPage({ params }: PageProps<"/app/listening/[testId]">) {
  const { testId } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_listening_test", { p_test_id: testId });

  if (error?.code === "PT403") {
    return (
      <div className="flex max-w-xl flex-col gap-4 pb-16">
        <h1 className="text-h1">This test is part of {planLabel(error.details)}</h1>
        <p className="text-muted-foreground">Upgrade to take it, or choose a test in your plan.</p>
        <div className="flex flex-wrap gap-3">
          <Link href={routes.upgrade} className={buttonVariants()}>
            See plans
          </Link>
          <Link href={routes.listening} className={buttonVariants({ variant: "outline" })}>
            All Listening tests
          </Link>
        </div>
      </div>
    );
  }
  const parsed = ListeningTestPayload.safeParse(data);
  if (error || !parsed.success) notFound();

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6 pb-16">
      <div className="flex flex-col gap-1">
        <Link href={routes.listening} className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Listening tests
        </Link>
        <h1 className="text-h1">{parsed.data.test.title}</h1>
        <p className="text-muted-foreground">Listening · 4 parts · {parsed.data.questions.length} questions</p>
      </div>
      <LiveListeningTest payload={parsed.data} />
    </div>
  );
}
