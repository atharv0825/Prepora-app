import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle, MessagesSquare, Mic } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { PracticeCard } from "@/components/practice/practice-card";
import { PickCard } from "@/components/practice/pick-card";
import { routes, speakingExaminerPath, speakingTopicPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";
import { speakingPartNote } from "@/lib/speaking/speaking";

export const metadata: Metadata = { title: "Speaking practice · Prepora", robots: { index: false } };

// Speaking Part 1 question sets (/app/speaking/parts/1) or Part 2 cue cards (/parts/2), opened from
// the Part 1 / Part 2 tiles on the Speaking home. The items as 3D cards (green until answered, then
// mint); a cue card keeps its Part 3 discussion link. Read through RLS: published topics, own answers.
export default async function SpeakingPartPage({ params }: PageProps<"/app/speaking/parts/[no]">) {
  const { no } = await params;
  if (no !== "1" && no !== "2") notFound();
  const part = Number(no) as 1 | 2;
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const supabase = await createClient();

  const [{ data: topics }, { data: responses }, { data: costs }] = await Promise.all([
    supabase.from("speaking_topics").select("id, part, title, cue_card_points, parent_topic_id").eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("speaking_responses").select("topic_id, band").order("created_at", { ascending: false }).limit(200),
    supabase.from("credit_costs").select("action_key, credits").in("action_key", ["speaking_p1", "speaking_p2", "speaking_p3"]),
  ]);
  const all = topics ?? [];
  const items = all.filter((t) => t.part === part);
  const discussionOf = new Map(all.filter((t) => t.part === 3 && t.parent_topic_id).map((t) => [t.parent_topic_id!, t.id]));
  const best = new Map<string, number>();
  for (const r of responses ?? []) best.set(r.topic_id, Math.max(best.get(r.topic_id) ?? 0, Number(r.band)));
  const cost = (k: string) => costs?.find((c) => c.action_key === k)?.credits;
  const noun: [string, string] = part === 1 ? ["Part 1 topic", "Part 1 topics"] : ["cue card", "cue cards"];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      <Link href={routes.speaking} data-testid="back-to-speaking" className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Speaking
      </Link>

      <PracticeHeader
        title={part === 1 ? "Part 1: about you" : "Part 2: cue cards"}
        progress={
          <CompletionBar
            completed={items.filter((t) => best.has(t.id)).length}
            total={items.length}
            noun={noun}
            ariaLabel={`Part ${part} topics completed`}
            testId="speaking-progress"
          />
        }
      >
        <p>{speakingPartNote(part, cost)}</p>
      </PracticeHeader>

      <section aria-label={part === 1 ? "Part 1 questions" : "Cue cards"}>
        {items.length === 0 ? (
          <p className="text-muted-foreground">No {noun[1]} yet. New ones are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <PickCard kind={part === 1 ? "speaking_p1" : "speaking_p2"} module="speaking" note={part === 1 ? "A Part 1 topic you haven't answered yet." : "A cue card you haven't answered yet."} />
            </li>
            {items.map((t) =>
              part === 1 ? (
                <li key={t.id} data-testid="part1-item">
                  <PracticeCard
                    module="speaking"
                    href={speakingExaminerPath(t.id)}
                    title={t.title}
                    kindLabel="Part 1"
                    icon={MessageCircle}
                    status={best.has(t.id) ? `Best band ${best.get(t.id)!.toFixed(1)}` : "Not answered yet"}
                    done={best.has(t.id)}
                    verbs={{ start: "Start", again: "Answer again" }}
                  />
                </li>
              ) : (
                <li key={t.id} data-testid="cue-card-item">
                  <PracticeCard
                    module="speaking"
                    href={speakingTopicPath(t.id)}
                    title={t.title}
                    kindLabel="Part 2"
                    icon={Mic}
                    status={best.has(t.id) ? `Best band ${best.get(t.id)!.toFixed(1)}` : "Not answered yet"}
                    detail={(t.cue_card_points ?? []).join(" · ")}
                    done={best.has(t.id)}
                    verbs={{ start: "Start", again: "Answer again" }}
                    extraLink={
                      discussionOf.has(t.id)
                        ? { href: speakingExaminerPath(discussionOf.get(t.id)!), label: "Part 3", icon: MessagesSquare, testId: "part3-link" }
                        : undefined
                    }
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
