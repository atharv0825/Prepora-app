import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MessageCircle, Mic, Timer } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { GroupCard } from "@/components/practice/group-card";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { speakingPartPath, speakingResponsePath, speakingSessionPath, speakingTestPath } from "@/lib/routes";
import { speakingPartNote } from "@/lib/speaking/speaking";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

// Speaking home (M7-F2, M8-F3; layout like Writing): Part 1 and Part 2 as tiles that open their own
// pages of topics (/app/speaking/parts/1, /2; a cue card keeps its Part 3 link), the full test with
// the AI examiner below them, and the student's history: full tests with their overall band, and
// every scored part. Read through RLS.
export default async function SpeakingPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const timeZone = validTimeZone(account.profile?.timezone);
  const supabase = await createClient();
  const [{ data: topics }, { data: responses }, { data: tests }, { data: costs }] = await Promise.all([
    supabase.from("speaking_topics").select("id, part, title, cue_card_points, parent_topic_id").eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("speaking_responses").select("id, part, topic_id, band, duration_sec, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("speaking_sessions").select("id, status, overall_band, started_at").eq("mode", "full_test").order("started_at", { ascending: false }).limit(20),
    supabase.from("credit_costs").select("action_key, credits").in("action_key", ["speaking_p1", "speaking_p2", "speaking_p3"]),
  ]);
  const all = topics ?? [];
  const cards = all.filter((t) => t.part === 2);
  const sets = all.filter((t) => t.part === 1);
  const discussionOf = new Map(all.filter((t) => t.part === 3 && t.parent_topic_id).map((t) => [t.parent_topic_id!, t.id]));
  const titleOf = new Map(all.map((c) => [c.id, c.title]));
  const best = new Map<string, number>();
  for (const r of responses ?? []) best.set(r.topic_id, Math.max(best.get(r.topic_id) ?? 0, Number(r.band)));
  const cost = (k: string) => costs?.find((c) => c.action_key === k)?.credits;
  const fullCost = ["speaking_p1", "speaking_p2", "speaking_p3"].reduce<number | null>((n, k) => (n === null || cost(k) === undefined ? null : n + cost(k)!), 0);
  const fullTestReady = sets.length > 0 && cards.some((c) => discussionOf.has(c.id));

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
        <p>The full test with an AI examiner who asks the questions out loud, or one part at a time. Every part gets a band for each criterion and feedback.</p>
      </PracticeHeader>

      {/* One soft panel, like the dashboard tiles: Part 1 | Part 2 | the full test (stacked on
          phones, full test last). Each opens its own page; the full test is outlined as the main option. */}
      <section aria-label="Practice by part" className="grid gap-3 rounded-[2rem] bg-muted p-3 sm:gap-4 sm:p-4 lg:grid-cols-3">
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
        <FullTestTile ready={fullTestReady} href={speakingTestPath()} cost={fullCost} />
      </section>

      {tests && tests.length > 0 && (
        <section aria-label="Your full tests" className="flex flex-col gap-3">
          <h2 className="text-h2">Your full tests</h2>
          <ul className="flex flex-col divide-y divide-foreground/5 rounded-2xl border border-foreground/5 bg-card" data-testid="test-history">
            {tests.map((t) => (
              <li key={t.id}>
                <Link href={speakingSessionPath(t.id)} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-secondary/40">
                  <span className="flex flex-col">
                    <span className="font-medium">Full test</span>
                    <span className="text-muted-foreground">
                      {formatDate(new Date(t.started_at), timeZone)}
                      {t.status === "in_progress" ? " · not finished" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg font-semibold tabular-nums">{t.overall_band !== null ? Number(t.overall_band).toFixed(1) : "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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

/** The full test as a white tile after Part 1 and Part 2, outlined in green as the main option. */
function FullTestTile({ ready, href, cost }: { ready: boolean; href: string; cost: number | null }) {
  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-chart-speaking text-white ring-4 ring-chart-speaking/20">
          <Timer className="size-5" />
        </span>
        {ready && (
          <span aria-hidden className="grid size-10 place-items-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
            <ArrowUpRight className="size-4" />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-medium">Full test</span>
        <span className="text-sm text-muted-foreground">
          Parts 1, 2 and 3 in about 12 minutes, then your overall band.{cost ? ` ${cost} credits, charged part by part.` : ""}
        </span>
      </span>
      <span className="mt-auto flex min-h-11 flex-wrap items-end justify-between gap-2 border-t border-border pt-4 text-xs">
        <span className="text-muted-foreground">{ready ? "Part 1 → Part 2 → Part 3 with the AI examiner" : "Coming soon: it needs more questions."}</span>
        {ready && <span className="rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground">Overall band</span>}
      </span>
    </>
  );
  const tile = "group flex h-full flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground shadow-xs ring-2 ring-primary/70 sm:p-6";
  return ready ? (
    <Link
      href={href}
      aria-label="Start the full test"
      className={`${tile} transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
      data-testid="full-test-cta"
    >
      {body}
    </Link>
  ) : (
    <div className={tile} data-testid="full-test-cta">
      {body}
    </div>
  );
}
