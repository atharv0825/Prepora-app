import { formatMoney } from "@prepora/shared/api/billing";
import { Badge } from "@prepora/ui/components/badge";
import { ManualPlanDialog } from "@/components/manual-plan-dialog";
import { createClient } from "@/lib/supabase/server";
import { formatDate, titleCase } from "@/lib/users";

const KIND_LABEL = { subscription: "Monthly", exam_pack: "Exam pack", topup: "Top-up" } as const;

/**
 * M9-A1: one user's subscriptions on their admin page (admin_user_subscriptions), newest first,
 * and the manual plan change. Admins only.
 */
export async function UserBilling({ userId, userName }: { userId: string; userName: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_user_subscriptions", { p_user_id: userId });
  if (error) console.error("admin_user_subscriptions failed", error.code, error.message);
  const subs = data ?? [];

  return (
    <section aria-labelledby="billing-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="billing-heading" className="text-h3">
          Subscriptions
        </h2>
        <ManualPlanDialog userId={userId} userName={userName} />
      </div>
      {error ? (
        <p role="alert" className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load subscriptions. Reload to try again.
        </p>
      ) : subs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid plans yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border" data-testid="user-subscriptions">
          {subs.map((s) => (
            <li key={s.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>
                <span className="font-medium">
                  {titleCase(s.plan_id)} · {KIND_LABEL[s.kind]}
                </span>{" "}
                <span className="text-muted-foreground">
                  via {titleCase(s.provider)}
                  {s.amount_minor !== null && s.currency ? ` · ${formatMoney(s.amount_minor, s.currency)}` : ""} · {formatDate(s.current_period_start)} → {formatDate(s.current_period_end)}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "destructive" : "outline"}>{titleCase(s.status.replace("_", " "))}</Badge>
                {s.cancel_at_period_end && s.status === "active" && <Badge variant="secondary">Ends at period end</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
