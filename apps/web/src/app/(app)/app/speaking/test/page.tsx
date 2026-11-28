import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { sessionStage } from "@prepora/shared/ielts/speaking-session";
import { FullTestFlow } from "@/components/speaking/full-test-flow";
import { routes, speakingSessionPath, speakingTestPath } from "@/lib/routes";
import { type FullTestPick, pickFullTest } from "@/lib/speaking/examiner";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking full test · Prepora", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (v: string | string[] | undefined) => (typeof v === "string" && UUID.test(v) ? v : undefined);

// M8-F2: the full test. The topics are chosen here and put in the URL (a reload keeps them);
// ?session= resumes a started test at the part it's at, with the topics of the parts already
// scored. A finished test goes to its results. Read through RLS (published topics, own sessions).
export default async function SpeakingTestPage({ searchParams }: PageProps<"/app/speaking/test">) {
  const account = await getAccount();
  if (!account) return null;
  const sp = await searchParams;
  const supabase = await createClient();

  let session: { id: string; scored: number[] } | null = null;
  const locked: Partial<FullTestPick> = {};
  const sessionId = id(sp.session);
  if (sessionId) {
    const { data: s } = await supabase.from("speaking_sessions").select("id, mode, status").eq("id", sessionId).maybeSingle();
    if (!s || s.mode !== "full_test") notFound();
    const { data: done } = await supabase.from("speaking_responses").select("part, topic_id").eq("session_id", s.id);
    const scored = (done ?? []).map((r) => r.part);
    if (s.status !== "in_progress" || sessionStage("full_test", scored) === "finished") redirect(speakingSessionPath(s.id));
    session = { id: s.id, scored };
    for (const r of done ?? []) locked[({ 1: "p1", 2: "card", 3: "p3" } as const)[r.part as 1 | 2 | 3]] = r.topic_id;
  }

  const { data: topics } = await supabase.from("speaking_topics").select("id, part, title, cue_card_points, parent_topic_id").eq("status", "published").in("part", [1, 2, 3]);
  const all = topics ?? [];
  const pick = pickFullTest(
    {
      part1: all.filter((t) => t.part === 1).map((t) => t.id),
      cards: all.filter((t) => t.part === 2).map((t) => t.id),
      discussions: all.filter((t) => t.part === 3 && t.parent_topic_id).map((t) => ({ id: t.id, card: t.parent_topic_id! })),
    },
    locked,
    { p1: id(sp.p1), card: id(sp.card), p3: id(sp.p3) },
    id(sp.not),
  );

  const back = (
    <Link href={routes.speaking} className="flex items-center gap-1 self-start text-sm font-medium underline-offset-4 hover:underline">
      <ArrowLeft className="size-4" aria-hidden /> All Speaking
    </Link>
  );
  if (!pick) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        {back}
        <h1 className="text-h1">Speaking full test</h1>
        <p className="text-muted-foreground" data-testid="test-unavailable">
          The full test isn&apos;t available yet: it needs Part 1 questions and a cue card with its Part 3 discussion. You can practise Part 2 cue cards meanwhile.
        </p>
      </div>
    );
  }
  // The chosen topics go in the URL, so a reload asks the same questions.
  if (pick.p1 !== sp.p1 || pick.card !== sp.card || pick.p3 !== sp.p3) redirect(speakingTestPath({ session: session?.id, ...pick }));

  const byId = new Map(all.map((t) => [t.id, t]));
  // A scored part's topic may have been unpublished since: its title isn't needed any more.
  const titled = (tid: string, fallback: string) => ({ id: tid, title: byId.get(tid)?.title ?? fallback });
  const card = byId.get(pick.card);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      {back}
      <h1 className="text-h1">Speaking full test</h1>
      <FullTestFlow
        topics={{
          part1: titled(pick.p1, "Part 1"),
          card: { id: pick.card, title: card?.title ?? "Your cue card", points: card?.cue_card_points ?? [] },
          part3: titled(pick.p3, "Discussion"),
        }}
        userId={account.user.id}
        session={session}
      />
    </div>
  );
}
