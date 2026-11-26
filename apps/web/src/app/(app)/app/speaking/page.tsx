import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mic } from "lucide-react";
import { cn } from "cn";
import { buttonVariants } from "@prepora/ui/components/button";
import { formatDate } from "@/lib/credits";
import { validTimeZone } from "@/lib/onboarding";
import { speakingResponsePath, speakingTopicPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { getAccount } from "@/lib/supabase/session";

export const metadata: Metadata = { title: "Speaking · Prepora", robots: { index: false } };

// Speaking home (M7-F2): published Part 2 cue cards, what scoring costs, and the student's scored
// answers. Parts 1 and 3 and the full test with the AI examiner come in M8. Read through RLS.
export default async function SpeakingPage() {
  const account = await getAccount();
  if (!account) return null; // the layout redirects first
  const timeZone = validTimeZone(account.profile?.timezone);
  const supabase = await createClient();
  const [{ data: cards }, { data: responses }, { data: cost }] = await Promise.all([
    supabase.from("speaking_topics").select("id, title, cue_card_points").eq("status", "published").eq("part", 2).order("published_at", { ascending: false }),
    supabase.from("speaking_responses").select("id, topic_id, band, duration_sec, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("credit_costs").select("credits").eq("action_key", "speaking_p2").maybeSingle(),
  ]);
  const titleOf = new Map((cards ?? []).map((c) => [c.id, c.title]));
  const best = new Map<string, number>();
  for (const r of responses ?? []) best.set(r.topic_id, Math.max(best.get(r.topic_id) ?? 0, Number(r.band)));

  return (
    <div className="flex w-full max-w-4xl flex-col gap-8 pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Speaking</h1>
        <p className="text-muted-foreground">
          Part 2 cue cards, as in the exam: 1 minute to prepare, then speak for up to 2 minutes, and get a band for each criterion.
          {cost?.credits ? <> Scoring costs {cost.credits} credits.</> : null} The AI examiner for Parts 1 and 3 is coming soon.
        </p>
      </div>

      <section aria-label="Cue cards" className="flex flex-col gap-3">
        <h2 className="text-h2">Cue cards</h2>
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
                <Link href={speakingTopicPath(c.id)} className={cn(buttonVariants(), "mt-auto self-start")}>
                  <Mic /> {best.has(c.id) ? "Answer again" : "Start"} <ArrowRight />
                </Link>
              </li>
            ))}
          </ul>
        )}
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
                    <span className="truncate font-medium">{titleOf.get(r.topic_id) ?? "A cue card no longer available"}</span>
                    <span className="text-muted-foreground">
                      {formatDate(new Date(r.created_at), timeZone)} · Part 2{r.duration_sec ? ` · ${Math.floor(r.duration_sec / 60)}:${String(r.duration_sec % 60).padStart(2, "0")}` : ""}
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
