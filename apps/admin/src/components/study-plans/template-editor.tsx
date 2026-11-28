"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CircleAlert, CircleCheck, Copy, Plus, X } from "lucide-react";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { dayItems, MAX_DAYS, MAX_ITEMS_PER_DAY, TEMPLATE_KINDS, type TemplateKind, templateCoverage } from "@prepora/shared/api/admin-study-plans";
import { studyItemKinds } from "@prepora/shared/api/study-plan";
import { saveStudyTemplate } from "@/lib/study-plan-actions";

const selectClass = "h-10 rounded-full border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";
const MODULE_LABEL = { reading: "Reading", listening: "Listening", writing: "Writing", speaking: "Speaking" } as const;

export type TemplateValues = { name: string; days: number; testType: "" | "academic" | "general"; dayKinds: TemplateKind[][] };

/**
 * M8.7-A1: a study plan template: name, length, test type, and each day's practice (in order, up
 * to 10 a day). Coverage updates as you edit: every kind (so every module) at least once, and
 * which days are empty. `studentsOn`: students following it now; saving then makes a new version.
 */
export function TemplateEditor({ id, values, studentsOn, readOnly }: { id: string | null; values: TemplateValues; studentsOn: number; readOnly?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(values.name);
  const [daysText, setDaysText] = useState(String(values.days));
  const [testType, setTestType] = useState(values.testType);
  // Kept for all days ever shown, so shortening by mistake doesn't lose a day's items.
  const [dayKinds, setDayKinds] = useState<TemplateKind[][]>(values.dayKinds);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const days = Math.min(MAX_DAYS, Math.max(1, Math.trunc(Number(daysText)) || 1));
  const shown = useMemo(() => Array.from({ length: days }, (_, d) => dayKinds[d] ?? []), [dayKinds, days]);
  const items = useMemo(() => dayItems(shown), [shown]);
  const coverage = useMemo(() => templateCoverage(items, days), [items, days]);
  const dropped = dayKinds.slice(days).reduce((n, k) => n + k.length, 0);

  const setDay = (d: number, f: (kinds: TemplateKind[]) => TemplateKind[]) =>
    setDayKinds((all) => {
      const next = Array.from({ length: Math.max(all.length, d + 1) }, (_, i) => all[i] ?? []);
      next[d] = f(next[d]!);
      return next;
    });
  const addKind = (d: number) => setDay(d, (k) => [...k, coverage.missingKinds[0] ?? "reading_test"]);
  const move = (d: number, i: number, by: -1 | 1) =>
    setDay(d, (k) => {
      const n = [...k];
      [n[i], n[i + by]] = [n[i + by]!, n[i]!];
      return n;
    });

  function save() {
    setError(null);
    start(async () => {
      const result = await saveStudyTemplate(id, { name, days, test_type: testType || null, items });
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      if (result.id && result.id !== id) router.push(`/study-plans/${result.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6" data-testid="template-editor">
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem_12rem]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name (staff only; students never see it)
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Balanced" className="h-11" required />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Days
          <Input type="number" min={1} max={MAX_DAYS} value={daysText} onChange={(e) => setDaysText(e.target.value)} className="h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          For
          <select value={testType} onChange={(e) => setTestType(e.target.value as TemplateValues["testType"])} className={`${selectClass} h-11`}>
            <option value="">Academic and General</option>
            <option value="academic">Academic only</option>
            <option value="general">General Training only</option>
          </select>
        </label>
      </fieldset>

      {/* Coverage, live. */}
      <section className="flex flex-col gap-3 rounded-2xl border border-border p-4" aria-label="Coverage" data-testid="coverage">
        <p className={`flex items-center gap-2 text-sm font-medium ${coverage.complete ? "text-primary" : "text-destructive"}`}>
          {coverage.complete ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
          {coverage.complete
            ? "Covers every module and kind of practice."
            : `Missing: ${coverage.missingKinds.map((k) => studyItemKinds[k].label).join(", ")}${coverage.missingModules.length ? ` (no ${coverage.missingModules.map((m) => MODULE_LABEL[m]).join(", ")} at all)` : ""}. It can't be activated until it covers them.`}
        </p>
        <ul className="flex flex-wrap gap-2 text-xs">
          {TEMPLATE_KINDS.map((k) => (
            <li key={k} className={`rounded-full px-2.5 py-1 ${coverage.counts[k] ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}>
              {studyItemKinds[k].label}: {coverage.counts[k]}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {items.length} items over {days} days.
          {coverage.emptyDays.length > 0 && ` Days with nothing to do: ${coverage.emptyDays.join(", ")} (a rest day is fine).`}
          {dropped > 0 && ` ${dropped} item${dropped === 1 ? "" : "s"} after day ${days} won't be saved.`}
        </p>
      </section>

      {/* The days. */}
      <ol className="flex flex-col divide-y divide-border rounded-2xl border border-border" aria-label="Days">
        {shown.map((kinds, d) => (
          <li key={d} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start" data-testid={`day-${d + 1}`}>
            <span className="w-16 shrink-0 pt-2 text-sm font-medium">Day {d + 1}</span>
            <div className="flex flex-1 flex-col gap-2">
              {kinds.length === 0 && <p className="pt-2 text-sm text-muted-foreground">Rest day</p>}
              {kinds.map((k, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={k}
                    disabled={readOnly || pending}
                    onChange={(e) => setDay(d, (ks) => ks.map((x, j) => (j === i ? (e.target.value as TemplateKind) : x)))}
                    aria-label={`Day ${d + 1}, item ${i + 1}`}
                    className={`${selectClass} min-w-48`}
                  >
                    {TEMPLATE_KINDS.map((o) => (
                      <option key={o} value={o}>
                        {studyItemKinds[o].label}
                      </option>
                    ))}
                  </select>
                  {!readOnly && (
                    <>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(d, i, -1)} disabled={pending || i === 0} aria-label={`Move day ${d + 1} item ${i + 1} up`}>
                        <ArrowUp />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => move(d, i, 1)} disabled={pending || i === kinds.length - 1} aria-label={`Move day ${d + 1} item ${i + 1} down`}>
                        <ArrowDown />
                      </Button>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDay(d, (ks) => ks.filter((_, j) => j !== i))} disabled={pending} aria-label={`Remove day ${d + 1} item ${i + 1}`}>
                        <X />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {!readOnly && (
                <div className="flex flex-wrap gap-2">
                  {kinds.length < MAX_ITEMS_PER_DAY && (
                    <Button type="button" variant="outline" size="sm" onClick={() => addKind(d)} disabled={pending}>
                      <Plus /> Add practice
                    </Button>
                  )}
                  {d > 0 && (shown[d - 1]?.length ?? 0) > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDay(d, () => [...shown[d - 1]!])} disabled={pending}>
                      <Copy /> Same as day {d}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!readOnly && (
        <div className="flex flex-col gap-2">
          {studentsOn > 0 && (
            <p className="text-sm text-muted-foreground">
              {studentsOn} student{studentsOn === 1 ? " follows" : "s follow"} this plan. Saving creates a new version for new students; they keep the one they started.
            </p>
          )}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" onClick={save} disabled={pending} className="h-11 self-start" data-testid="save-template">
            {pending ? "Saving…" : id ? (studentsOn > 0 ? "Save as a new version" : "Save") : "Create study plan"}
          </Button>
        </div>
      )}
    </div>
  );
}
