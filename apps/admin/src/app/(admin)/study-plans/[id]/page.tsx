import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";
import { ContentId } from "@prepora/shared/api/admin-reading";
import { itemsByDay, templateCoverage } from "@prepora/shared/api/admin-study-plans";
import type { StudyItemKind } from "@prepora/shared/api/study-plan";
import { Badge } from "@prepora/ui/components/badge";
import { ActiveToggle } from "@/components/study-plans/active-toggle";
import { TemplateEditor } from "@/components/study-plans/template-editor";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/users";

export const metadata: Metadata = { title: "Study plan" };

// M8.7-A1: one study plan template (or /study-plans/new): its days and items with live coverage,
// and activate / deactivate. One that students follow is saved as a new version, so their plans
// don't change; an earlier version is read-only and links to the newer one. Staff only.
export default async function StudyPlanPage({ params }: PageProps<"/study-plans/[id]">) {
  const { id } = await params;
  const back = (
    <Link href="/study-plans" className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline">
      ← Study plans
    </Link>
  );

  if (id === "new") {
    return (
      <div className="flex flex-col gap-6 pb-16">
        {back}
        <div>
          <h1 className="text-h2">New study plan</h1>
          <p className="mt-1 text-muted-foreground">It starts inactive. Activate it once it covers every kind of practice.</p>
        </div>
        <TemplateEditor id={null} studentsOn={0} values={{ name: "", days: 14, testType: "", dayKinds: [] }} />
      </div>
    );
  }

  if (!ContentId.safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data: t, error } = await supabase
    .from("study_plan_templates")
    .select("id, name, days, test_type, active, replaced_by, updated_at, study_plan_items(day, order_no, kind)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`study_plan_templates failed: ${error.code}`);
  if (!t) notFound();
  const [{ count: studentsOn }, { data: newer }] = await Promise.all([
    supabase.from("user_study_plans").select("id", { count: "exact", head: true }).eq("template_id", t.id).eq("status", "active"),
    t.replaced_by ? supabase.from("study_plan_templates").select("id, name").eq("id", t.replaced_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = t.study_plan_items as { day: number; order_no: number; kind: StudyItemKind }[];
  const saved = templateCoverage(rows, t.days);
  const blocked = t.replaced_by ? "An earlier version can't be activated." : rows.length === 0 ? "Add items and save first." : saved.complete ? null : "Save it with every kind of practice first.";
  const on = studentsOn ?? 0;

  return (
    <div className="flex flex-col gap-6 pb-16">
      {back}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-h2">{t.name}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {t.replaced_by ? <Badge variant="outline">Earlier version</Badge> : <Badge variant={t.active ? "default" : "secondary"} data-testid="template-status">{t.active ? "Active" : "Inactive"}</Badge>}
            {on} student{on === 1 ? "" : "s"} on it · updated {formatDateTime(t.updated_at)}
          </p>
        </div>
        {!t.replaced_by && <ActiveToggle id={t.id} active={t.active} blocked={blocked} />}
      </div>

      {t.replaced_by ? (
        <p className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This version was edited while students followed it. It stays as it was for them{on ? ` (${on} now)` : ""}, and isn&apos;t offered to anyone new.{" "}
            {newer && (
              <Link href={`/study-plans/${newer.id}`} className="font-medium underline underline-offset-4">
                Open the newer version: {newer.name}
              </Link>
            )}
          </span>
        </p>
      ) : (
        on > 0 && (
          <p className="flex items-start gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {on} student{on === 1 ? " is" : "s are"} following this plan. Saving changes creates a new version for new students; they keep this one. Deactivating only stops new students getting it.
          </p>
        )
      )}

      <TemplateEditor
        // A new version opens on its own page; a fresh key resets the editor after a save.
        key={t.updated_at}
        id={t.id}
        studentsOn={on}
        readOnly={Boolean(t.replaced_by)}
        values={{ name: t.name, days: t.days, testType: t.test_type ?? "", dayKinds: itemsByDay(rows, t.days) }}
      />
    </div>
  );
}
