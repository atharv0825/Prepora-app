import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import type { AdminAuditEntry } from "@prepora/shared/api/admin-credits";
import { PlanLimits } from "@prepora/shared/api/credits";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { AdminOnly } from "@/components/admin-only";
import { AuditList } from "@/components/audit-list";
import { CreditCostForm } from "@/components/credit-cost-form";
import { PlanForm } from "@/components/plan-form";
import { gatedFeatureLabels } from "@/lib/credits";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Plans & pricing" };

// M3-A1: plans & credits editor. Each plan's limits (monthly/welcome credits, daily cap,
// allowances, features) and the credits each AI action costs. Reads are public tables; writes go
// through admin_update_plan / admin_update_credit_cost (admins only, audited). Regional prices,
// exam packs and top-ups come with billing (M9).
const PLAN_ORDER = ["free", "gold", "platinum"];

export default async function PlansPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") {
    return <AdminOnly reason="Plan limits and credit prices change what every student gets, so only admins can open this page." />;
  }

  const supabase = await createClient();
  const [plansRes, costsRes, auditRes] = await Promise.all([
    supabase.from("plans").select("id, name, limits, is_active, updated_at"),
    supabase.from("credit_costs").select("action_key, label, credits, required_feature, est_cost_usd, is_active").order("label"),
    supabase.rpc("admin_audit_entries", { p_entities: ["plan", "credit_cost"], p_limit: 15 }),
  ]);
  if (plansRes.error) throw new Error(`plans failed: ${plansRes.error.code}`);
  if (costsRes.error) throw new Error(`credit_costs failed: ${costsRes.error.code}`);
  if (auditRes.error) console.error("admin_audit_entries failed", auditRes.error.code, auditRes.error.message);

  const plans = (plansRes.data ?? [])
    .flatMap((p) => {
      const limits = PlanLimits.safeParse(p.limits);
      return limits.success ? [{ ...p, limits: limits.data }] : [];
    })
    .sort((a, b) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id));
  const costs = costsRes.data ?? [];
  const costLabels = Object.fromEntries(costs.map((c) => [c.action_key, c.label]));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <ScrollText className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Plans &amp; pricing</h1>
          <p className="mt-1 text-muted-foreground">
            What each plan includes and what AI actions cost. Changes are live for every student once saved.
          </p>
        </div>
      </div>

      <section aria-labelledby="plans-heading" className="flex flex-col gap-4">
        <h2 id="plans-heading" className="text-h3">
          Plans
        </h2>
        <div className="grid gap-4 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {p.name}
                  {!p.is_active && <Badge variant="outline">Inactive</Badge>}
                </CardTitle>
                <CardDescription>
                  1 credit ≈ US$0.01 of AI. Prices per country come with billing (M9).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PlanForm id={p.id} name={p.name} limits={p.limits} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="costs-heading" className="flex flex-col gap-4">
        <div>
          <h2 id="costs-heading" className="text-h3">
            Credit cost per action
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Charged on the next spend. Students see the new price in &ldquo;This costs N credits&rdquo;. Adding or retiring an
            action needs a code change.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {costs.map((c) => (
            <li key={c.action_key} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{c.label}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <code className="font-mono">{c.action_key}</code>
                  {c.required_feature && (
                    <Badge variant="outline">Needs {gatedFeatureLabels[c.required_feature as keyof typeof gatedFeatureLabels] ?? c.required_feature}</Badge>
                  )}
                  {!c.is_active && <Badge variant="secondary">Inactive</Badge>}
                </span>
              </div>
              <div className="sm:w-72">
                <CreditCostForm
                  actionKey={c.action_key}
                  label={c.label}
                  credits={c.credits}
                  estCostUsd={c.est_cost_usd == null ? null : Number(c.est_cost_usd)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="changes-heading" className="flex flex-col gap-4">
        <h2 id="changes-heading" className="text-h3">
          Recent changes
        </h2>
        <AuditList entries={(auditRes.data ?? []) as AdminAuditEntry[]} costLabels={costLabels} empty="No changes yet." />
      </section>
    </div>
  );
}
