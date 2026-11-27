import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageCircle, MessagesSquare, Mic, Timer } from "lucide-react";
import { CompletionBar } from "@/components/practice/completion-bar";
import { PracticeHeader } from "@/components/practice/page-header";
import { PracticeCard } from "@/components/practice/practice-card";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { speakingExaminerPath, speakingResponsePath, speakingSessionPath, speakingTestPath, speakingTopicPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

// Speaking home (M7-F2, M8-F3): the full test with the AI examiner, Part 1 question sets, Part 2
// cue cards (each with its Part 3 discussion when there is one), what each costs, and the
// student's history: full tests with their overall band, and every scored part. Read through RLS.
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

      {/* The full test: a 3D green banner. */}
      <section
        aria-label="Full test"
        className="flex flex-col gap-4 rounded-3xl bg-gradient-to-b from-[#62d7a5] to-brand-primary p-6 text-brand-ink ring-1 ring-black/5 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),inset_0_-2px_0_rgb(8_34_43/0.08),0_14px_30px_-16px_rgb(15_164_103/0.8)] sm:flex-row sm:items-center sm:justify-between"
        data-testid="full-test-cta"
      >
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-white/25 ring-1 ring-white/60">
            <Timer className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-h2">Full test</h2>
            <p className="text-sm text-brand-ink/80">
              Parts 1, 2 and 3 in about 12 minutes, then your overall band.{fullCost ? ` ${fullCost} credits, charged part by part.` : ""}
            </p>
          </div>
        </div>
        {fullTestReady ? (
          <Link
            href={speakingTestPath()}
            className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-brand-ink px-5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_10px_20px_-10px_rgb(8_34_43/0.7)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink motion-reduce:hover:translate-y-0 sm:self-center"
          >
            Start the full test <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <p className="text-sm text-brand-ink/80">Coming soon: it needs more questions.</p>
        )}
      </section>

      {sets.length > 0 && (
        <section aria-label="Part 1 questions" className="flex flex-col gap-3">
          <h2 className="text-h2">Part 1: about you</h2>
          <p className="text-sm text-muted-foreground">4–5 short questions from the examiner.{cost("speaking_p1") ? ` ${cost("speaking_p1")} credits.` : ""}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sets.map((t) => (
              <li key={t.id} data-testid="part1-item">
                <PracticeCard
                  href={speakingExaminerPath(t.id)}
                  title={t.title}
                  kindLabel="Part 1"
                  icon={MessageCircle}
                  status={best.has(t.id) ? `Best band ${best.get(t.id)!.toFixed(1)}` : "Not answered yet"}
                  done={best.has(t.id)}
                  verbs={{ start: "Start", again: "Answer again" }}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Cue cards" className="flex flex-col gap-3">
        <h2 className="text-h2">Part 2: cue cards</h2>
        <p className="text-sm text-muted-foreground">
          1 minute to prepare, then speak for up to 2 minutes.{cost("speaking_p2") ? ` ${cost("speaking_p2")} credits.` : ""} Part 3 discusses the card&apos;s theme{cost("speaking_p3") ? ` (${cost("speaking_p3")} credits)` : ""}.
        </p>
        {!cards?.length ? (
          <p className="text-muted-foreground">No cue cards yet. New ones are added regularly.</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((c) => (
              <li key={c.id} data-testid="cue-card-item">
                <PracticeCard
                  href={speakingTopicPath(c.id)}
                  title={c.title}
                  kindLabel="Part 2"
                  icon={Mic}
                  status={best.has(c.id) ? `Best band ${best.get(c.id)!.toFixed(1)}` : "Not answered yet"}
                  detail={(c.cue_card_points ?? []).join(" · ")}
                  done={best.has(c.id)}
                  verbs={{ start: "Start", again: "Answer again" }}
                  extraLink={
                    discussionOf.has(c.id)
                      ? { href: speakingExaminerPath(discussionOf.get(c.id)!), label: "Part 3", icon: MessagesSquare, testId: "part3-link" }
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
        )}
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
