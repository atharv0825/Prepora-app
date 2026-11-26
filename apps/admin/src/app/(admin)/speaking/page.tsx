import type { Metadata } from "next";
import Link from "next/link";
import { Mic } from "lucide-react";
import { type ContentStatus, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { statusBadge } from "@/components/reading/status";
import { TopicForm } from "@/components/speaking/topic-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Speaking" };

// M7-A1: Part 2 cue cards, every status, with how many Part 3 discussions follow each, and a form
// to start a new card. Staff only (the layout checks; RLS lets staff read drafts). Part 1 question
// sets come with M8-A1.
export default async function SpeakingTopicsPage() {
  const supabase = await createClient();
  const { data: topics, error } = await supabase
    .from("speaking_topics")
    .select("id, part, title, status, source, parent_topic_id, cue_card_points, updated_at")
    .in("part", [2, 3])
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`speaking_topics failed: ${error.code}`);
  const cards = (topics ?? []).filter((t) => t.part === 2);
  const part3 = new Map<string, { total: number; published: number }>();
  for (const t of (topics ?? []).filter((t) => t.part === 3 && t.parent_topic_id)) {
    const c = part3.get(t.parent_topic_id!) ?? { total: 0, published: 0 };
    part3.set(t.parent_topic_id!, { total: c.total + 1, published: c.published + (t.status === "published" ? 1 : 0) });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <Mic className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Speaking</h1>
          <p className="mt-1 text-muted-foreground">Part 2 cue cards, and the Part 3 discussions that follow each one. Part 1 question sets arrive with the examiner (M8).</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New cue card</CardTitle>
          <CardDescription>It starts as a draft. Students see it only once you publish it.</CardDescription>
        </CardHeader>
        <CardContent>
          <TopicForm kind="card" />
        </CardContent>
      </Card>

      <section aria-labelledby="cards-heading" className="flex flex-col gap-4">
        <h2 id="cards-heading" className="text-h3">
          Cue cards
        </h2>
        {cards.length === 0 ? (
          <p className="text-muted-foreground">No cue cards yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="speaking-cards">
            {cards.map((t) => {
              const p3 = part3.get(t.id);
              return (
                <li key={t.id}>
                  <Link href={`/speaking/${t.id}`} className="flex flex-col gap-1.5 px-4 py-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{t.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.cue_card_points?.length ?? 0} points · {p3 ? `${p3.total} Part 3 (${p3.published} published)` : "no Part 3 yet"} · updated {formatDateTime(t.updated_at)}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {t.source === "ai" && <Badge variant="outline">AI</Badge>}
                      <Badge variant={statusBadge(t.status as ContentStatus)}>{contentStatusLabels[t.status as ContentStatus]}</Badge>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
