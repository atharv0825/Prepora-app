import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";
import type { AdminAuditEntry } from "@prepora/shared/api/admin-credits";
import { buttonVariants } from "@prepora/ui/components/button";
import { AdminOnly } from "@/components/admin-only";
import { AuditList } from "@/components/audit-list";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Credits" };

// M3-A2: credits are looked after per user (Users → a user: balance, ledger, grant, refund).
// This page is the support overview: the latest grants and refunds across all users, from
// audit_log. Real AI cost per credit (ai_usage) comes with M11.
export default async function CreditsPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const supabase = await createClient();
  const [auditRes, costsRes] = await Promise.all([
    supabase.rpc("admin_audit_entries", { p_entities: ["user"], p_limit: 50 }),
    supabase.from("credit_costs").select("action_key, label"),
  ]);
  if (auditRes.error) throw new Error(`admin_audit_entries failed: ${auditRes.error.code}`);
  const costLabels = Object.fromEntries((costsRes.data ?? []).map((c) => [c.action_key, c.label]));
  const entries = ((auditRes.data ?? []) as AdminAuditEntry[]).filter((e) => e.action.startsWith("credits."));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
            <Coins className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h1 className="text-h2">Credits</h1>
            <p className="mt-1 text-muted-foreground">
              To see a balance, grant or refund, open the user from Users.
            </p>
          </div>
        </div>
        <Link href="/users" className={buttonVariants({ variant: "outline" })}>
          Find a user
        </Link>
      </div>

      <section aria-labelledby="support-heading" className="flex flex-col gap-4">
        <h2 id="support-heading" className="text-h3">
          Recent grants and refunds
        </h2>
        <AuditList entries={entries} costLabels={costLabels} empty="No grants or refunds yet." linkUsers />
      </section>
    </div>
  );
}
