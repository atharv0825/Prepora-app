import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, Mic } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { GroupCard } from "@/components/practice/group-card";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { speakingPartPath, speakingResponsePath } from "@/lib/routes";
import { speakingPartNote } from "@/lib/speaking/speaking";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

// Speaking home (M7-F2, M8-F3; layout like Writing): Part 1 and Part 2 as tiles that open their own
// pages of topics (/app/speaking/parts/1, /2; a cue card keeps its Part 3 link), and the student's
// history: every scored part. There's no Speaking full test. Read through RLS.
export default async function SpeakingPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const timeZone = validTimeZone(account.profile?.timezone);
  const supabase = await createClient();
  const [{ data: topics }, { data: responses }, { data: costs }] = await Promise.all([
    supabase.from("speaking_topics").select("id, part, title, cue_card_points, parent_topic_id").eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("speaking_responses").select("id, part, topic_id, band, duration_sec, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("credit_costs").select("action_key, credits").in("action_key", ["speaking_p1", "speaking_p2", "speaking_p3"]),
  ]);
  const all = topics ?? [];
  const cards = all.filter((t) => t.part === 2);
  const sets = all.filter((t) => t.part === 1);
  const titleOf = new Map(all.map((c) => [c.id, c.title]));
  const best = new Map<string, number>();
  for (const r of responses ?? []) best.set(r.topic_id, Math.max(best.get(r.topic_id) ?? 0, Number(r.band)));
  const cost = (k: string) => costs?.find((c) => c.action_key === k)?.credits;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      {/* Completed = Part 1 sets and cue cards answered at least once, out of all published. */}
      <PracticeHeader
        title="Speaking"
        progress={
          <CompletionBar
            module="speaking"
            completed={[...sets, ...cards].filter((t) => best.has(t.id)).length}
            total={sets.length + cards.length}
            noun={["Speaking topic", "Speaking topics"]}
            ariaLabel="Speaking topics completed"
            testId="speaking-progress"
          />
        }
      >
        <p>Practise one part at a time with an AI examiner who asks the questions out loud. Every part gets a band for each criterion and feedback.</p>
      </PracticeHeader>

      {/* One soft panel, like the dashboard tiles: Part 1 | Part 2 (stacked on phones). Each opens its own page. */}
      <section aria-label="Practice by part" className="grid gap-3 rounded-[2rem] bg-muted p-3 sm:grid-cols-2 sm:gap-4 sm:p-4">
        <GroupCard
          href={speakingPartPath(1)}
          title="Part 1: about you"
          note={speakingPartNote(1, cost)}
          icon={MessageCircle}
          module="speaking"
          noun={["topic", "topics"]}
          total={sets.length}
          done={sets.filter((t) => best.has(t.id)).length}
          doneWord="answered"
          testId="speaking-group"
        />
        <GroupCard
          href={speakingPartPath(2)}
          title="Part 2: cue cards"
          note={speakingPartNote(2, cost)}
          icon={Mic}
          module="speaking"
          noun={["cue card", "cue cards"]}
          total={cards.length}
          done={cards.filter((t) => best.has(t.id)).length}
          doneWord="answered"
          testId="speaking-group"
        />
      </section>

      <section aria-label="Your answers" className="flex flex-col gap-3">
        <h2 className="text-h2">Your answers</h2>
        {!responses?.length ? (
          <p className="text-sm text-muted-foreground">No scored answers yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card" data-testid="speaking-history">
            {responses.map((r) => (
              <li key={r.id}>
                <Link href={speakingResponsePath(r.id)} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-secondary/40">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{titleOf.get(r.topic_id) ?? "A topic no longer available"}</span>
                    <span className="text-muted-foreground">
                      {formatDate(new Date(r.created_at), timeZone)} · Part {r.part}
                      {r.duration_sec ? ` · ${Math.floor(r.duration_sec / 60)}:${String(r.duration_sec % 60).padStart(2, "0")}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">{Number(r.band).toFixed(1)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
