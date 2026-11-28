import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, CircleAlert, Plus } from "lucide-react";
import { templateCoverage } from "@prepora/shared/api/admin-study-plans";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Study plans" };

const TYPE_LABEL = { academic: "Academic", general: "General Training" } as const;

// M8.7-A1: the study plan templates. Students get an active one at random and never see its name.
// Each row: length, who it's for, coverage, how many students follow it now, active or not.
// Earlier versions (edited while students followed them) are listed apart. Staff only (layout + RLS).
export default async function StudyPlansPage() {
  const supabase = await createClient();
  const [{ data: templates, error }, { data: plans, error: plansError }] = await Promise.all([
    supabase
      .from("study_plan_templates")
      .select("id, name, days, test_type, active, replaced_by, updated_at, study_plan_items(day, kind)")
      .order("active", { ascending: false })
      .order("name"),
    supabase.from("user_study_plans").select("template_id").eq("status", "active"),
  ]);
  if (error) throw new Error(`study_plan_templates failed: ${error.code}`);
  if (plansError) throw new Error(`user_study_plans failed: ${plansError.code}`);
  const following = new Map<string, number>();
  for (const p of plans ?? []) following.set(p.template_id, (following.get(p.template_id) ?? 0) + 1);
  const current = (templates ?? []).filter((t) => !t.replaced_by);
  const earlier = (templates ?? []).filter((t) => t.replaced_by);

  const row = (t: NonNullable<typeof templates>[number]) => {
    const items = t.study_plan_items as { day: number; kind: StudyItemKind }[];
    const cov = templateCoverage(items, t.days);
    const on = following.get(t.id) ?? 0;
    return (
      <li key={t.id}>
        <Link href={`/study-plans/${t.id}`} className="flex flex-col gap-1.5 px-4 py-4 hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex min-w-0 flex-col gap-1">
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">
              {t.days} days · {items.length} items · {t.test_type ? TYPE_LABEL[t.test_type] : "Academic and General"} · {on} student{on === 1 ? "" : "s"} on it · updated {formatDateTime(t.updated_at)}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {!cov.complete && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <CircleAlert className="size-3.5" aria-hidden /> Missing {cov.missingKinds.length} kind{cov.missingKinds.length === 1 ? "" : "s"}
              </span>
            )}
            {t.replaced_by ? <Badge variant="outline">Earlier version</Badge> : <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Active" : "Inactive"}</Badge>}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
            <CalendarRange className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h1 className="text-h2">Study plans</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">
              The templates study plans are made from. A student who asks for a plan gets an active one at random (for their test type) and never sees its name. Editing a template students follow
              creates a new version; they keep the one they started.
            </p>
          </div>
        </div>
        <Link href="/study-plans/new" className={buttonVariants()} data-testid="new-template">
          <Plus /> New study plan
        </Link>
      </div>

      {current.length === 0 ? (
        <p className="text-muted-foreground">No study plans yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="templates">
          {current.map(row)}
        </ul>
      )}

      {earlier.length > 0 && (
        <section aria-labelledby="earlier-heading" className="flex flex-col gap-3">
          <h2 id="earlier-heading" className="text-h3">
            Earlier versions
          </h2>
          <p className="text-sm text-muted-foreground">Kept for the students who started them. They aren&apos;t offered to anyone new.</p>
          <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="earlier-templates">
            {earlier.map(row)}
          </ul>
        </section>
      )}
    </div>
  );
}
