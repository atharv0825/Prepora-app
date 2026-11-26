import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { ContentId, type ContentStatus, contentStatusLabels } from "@prepora/shared/api/admin-reading";
import { speakingPublishCheck } from "@prepora/shared/api/admin-speaking";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { StatusActions } from "@/components/reading/status-actions";
import { statusBadge } from "@/components/reading/status";
import { TopicForm } from "@/components/speaking/topic-form";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Speaking topic" };

// M7-A1: one Speaking topic. A Part 2 cue card: status, publish checklist, details, what students
// see, and its Part 3 discussions (add one here). A Part 3 discussion: the same, with a link back
// to its card. Staff only (layout + RLS).
export default async function SpeakingTopicPage({ params }: PageProps<"/speaking/[topicId]">) {
  const { topicId } = await params;
  if (!ContentId.safeParse(topicId).success) notFound();
  const supabase = await createClient();
  const { data: topic, error } = await supabase
    .from("speaking_topics")
    .select("id, part, title, cue_card_points, questions, parent_topic_id, status, updated_at")
    .eq("id", topicId)
    .maybeSingle();
  if (error) throw new Error(`speaking_topics failed: ${error.code}`);
  if (!topic || topic.part === 1) notFound();
  const [{ data: parent }, { data: children }] = await Promise.all([
    topic.parent_topic_id
      ? supabase.from("speaking_topics").select("id, title, status").eq("id", topic.parent_topic_id).maybeSingle()
      : Promise.resolve({ data: null }),
    topic.part === 2
      ? supabase.from("speaking_topics").select("id, title, status, questions").eq("parent_topic_id", topic.id).order("created_at")
      : Promise.resolve({ data: [] as { id: string; title: string; status: string; questions: string[] | null }[] }),
  ]);
  const check = speakingPublishCheck({ ...topic, parent_status: parent?.status ?? null });
  const status = topic.status as ContentStatus;
  const card = topic.part === 2;

  return (
    <div className="flex flex-col gap-8 pb-16">
      <div className="flex flex-col gap-3">
        <Link href={card ? "/speaking" : `/speaking/${topic.parent_topic_id}`} className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← {card ? "Cue cards" : `Cue card: ${parent?.title ?? "…"}`}
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{card ? "Part 2 cue card" : "Part 3 discussion"}</p>
            <h1 className="text-h2">{topic.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={statusBadge(status)} data-testid="topic-status">
                {contentStatusLabels[status]}
              </Badge>
              updated {formatDateTime(topic.updated_at)}
            </p>
          </div>
          <StatusActions module="speaking" testId={topic.id} status={status} check={check} />
        </div>
        {status === "published" && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            This topic is live. Changes reach students as soon as you save them; feedback already given isn&apos;t changed.
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ready to publish?</CardTitle>
          <CardDescription>The topic is checked again when you publish.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm" data-testid="publish-check">
            {check.blocking.length === 0 && (
              <li className="flex items-start gap-2 text-primary">
                <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {card ? "The card has its task and points." : "The questions are in place and the cue card is published."}
              </li>
            )}
            {check.blocking.map((b) => (
              <li key={b} className="flex items-start gap-2 text-destructive">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {b}
              </li>
            ))}
            {check.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {w}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          {card ? (
            <TopicForm kind="card" topicId={topic.id} values={{ title: topic.title, items: topic.cue_card_points ?? [] }} />
          ) : (
            <TopicForm kind="part3" topicId={topic.id} parentId={topic.parent_topic_id!} values={{ title: topic.title, items: topic.questions ?? [] }} />
          )}
        </CardContent>
      </Card>

      {card && (
        <Card>
          <CardHeader>
            <CardTitle>What students see</CardTitle>
            <CardDescription>1 minute to prepare with notes, then up to 2 minutes to speak.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mint flex flex-col gap-2 rounded-2xl bg-background p-5 text-foreground" data-testid="card-preview">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Part 2 · Cue card</p>
              <p className="text-lg font-medium">{topic.title}</p>
              <p className="text-sm">You should say:</p>
              <ul className="list-disc pl-5 text-sm">
                {(topic.cue_card_points ?? []).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {card && (
        <Card>
          <CardHeader>
            <CardTitle>Part 3 discussions</CardTitle>
            <CardDescription>The examiner&apos;s follow-up discussion after this card (used by the full test, M8). Each is published after the card.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {children && children.length > 0 ? (
              <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="part3-list">
                {children.map((c) => (
                  <li key={c.id}>
                    <Link href={`/speaking/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/40">
                      <span className="flex flex-col">
                        <span className="font-medium">{c.title}</span>
                        <span className="text-xs text-muted-foreground">{c.questions?.length ?? 0} questions</span>
                      </span>
                      <Badge variant={statusBadge(c.status as ContentStatus)}>{contentStatusLabels[c.status as ContentStatus]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No Part 3 discussion yet.</p>
            )}
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border p-4">
              <p className="text-sm font-medium">Add a Part 3 discussion</p>
              <TopicForm kind="part3" parentId={topic.id} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
