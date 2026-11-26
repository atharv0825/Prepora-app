import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessagesSquare, Mic, Timer } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
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
    <div className="flex w-full max-w-4xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Speaking</h1>
        <p className="text-muted-foreground">
          The full test with an AI examiner who asks the questions out loud, or one part at a time. Every part gets a band for each criterion and feedback.
        </p>
      </div>

      <section aria-label="Full test" className="flex flex-col gap-3 rounded-3xl bg-secondary p-6 sm:flex-row sm:items-center sm:justify-between" data-testid="full-test-cta">
        <div className="flex flex-col gap-1">
          <h2 className="text-h2">Full test</h2>
          <p className="text-sm text-muted-foreground">
            Parts 1, 2 and 3 in about 12 minutes, then your overall band.{fullCost ? ` ${fullCost} credits, charged part by part.` : ""}
          </p>
        </div>
        {fullTestReady ? (
          <Link href={speakingTestPath()} className={cn(buttonVariants(), "shrink-0")}>
            <Timer /> Start the full test
          </Link>
        ) : (
          <p className="text-sm text-muted-foreground">Coming soon: it needs more questions.</p>
        )}
      </section>

      {sets.length > 0 && (
        <section aria-label="Part 1 questions" className="flex flex-col gap-3">
          <h2 className="text-h2">Part 1: about you</h2>
          <p className="text-sm text-muted-foreground">4–5 short questions from the examiner.{cost("speaking_p1") ? ` ${cost("speaking_p1")} credits.` : ""}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {sets.map((t) => (
              <li key={t.id}>
                <Link href={speakingExaminerPath(t.id)} className="flex items-center justify-between gap-3 rounded-2xl border border-foreground/5 bg-card p-4 text-sm shadow-sm hover:bg-secondary/40" data-testid="part1-item">
                  <span className="font-medium">{t.title}</span>
                  <span className="shrink-0 text-muted-foreground">{best.has(t.id) ? `Best ${best.get(t.id)!.toFixed(1)}` : <ArrowRight className="size-4" aria-hidden />}</span>
                </Link>
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
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-3xl border border-foreground/5 bg-card p-5 shadow-sm" data-testid="cue-card-item">
                <h3 className="text-h3">{c.title}</h3>
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {(c.cue_card_points ?? []).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">{best.has(c.id) ? `Best band ${best.get(c.id)!.toFixed(1)}` : "Not answered yet"}</p>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link href={speakingTopicPath(c.id)} className={buttonVariants()}>
                    <Mic /> {best.has(c.id) ? "Answer again" : "Start"} <ArrowRight />
                  </Link>
                  {discussionOf.has(c.id) && (
                    <Link href={speakingExaminerPath(discussionOf.get(c.id)!)} className={buttonVariants({ variant: "outline" })} data-testid="part3-link">
                      <MessagesSquare /> Part 3
                    </Link>
                  )}
                </div>
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
