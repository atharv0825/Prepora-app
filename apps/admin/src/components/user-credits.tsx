import type { AdminAuditEntry, AdminLedgerEntry } from "@prepora/shared/api/admin-credits";
import { CreditBalance, allowanceRemaining } from "@prepora/shared/api/credits";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { cn } from "@prepora/ui/lib/utils";
import { AuditList } from "@/components/audit-list";
import { GrantCreditsDialog, RefundDialog } from "@/components/credit-dialogs";
import { ledgerRows, signedCredits, sourceLabels } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, titleCase } from "@/lib/users";

const allowanceTitles: Record<string, string> = {
  reading_tests: "Reading tests",
  listening_tests: "Listening tests",
  practice_sessions: "Practice sessions",
  mock_tests: "Full mock tests",
};

const LEDGER_LIMIT = 200;

/**
 * M3-A2: one user's credits on their admin page. The same balance the student sees
 * (admin_user_credits → credits_summary), the ledger with a refund action on each spend, a
 * grant action, and the admin changes made to this user (audit_log). Admins only.
 */
export async function UserCredits({ userId, userName }: { userId: string; userName: string }) {
  const supabase = await createClient();
  const [creditsRes, ledgerRes, auditRes, costsRes] = await Promise.all([
    supabase.rpc("admin_user_credits", { p_user_id: userId }),
    supabase.rpc("admin_user_ledger", { p_user_id: userId, p_limit: LEDGER_LIMIT }),
    supabase.rpc("admin_audit_entries", { p_entities: ["user"], p_entity_id: userId, p_limit: 20 }),
    supabase.from("credit_costs").select("action_key, label"),
  ]);
  for (const [name, res] of [["admin_user_credits", creditsRes], ["admin_user_ledger", ledgerRes], ["admin_audit_entries", auditRes]] as const) {
    if (res.error) console.error(`${name} failed`, res.error.code, res.error.message);
  }

  const parsed = CreditBalance.safeParse(creditsRes.data);
  const credits = parsed.success ? parsed.data : null;
  const costLabels = Object.fromEntries((costsRes.data ?? []).map((c) => [c.action_key, c.label]));
  const entries = (ledgerRes.data ?? []) as AdminLedgerEntry[];
  const rows = ledgerRows(entries, costLabels);

  return (
    <section aria-labelledby="credits-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="credits-heading" className="text-h3">
          Credits
        </h2>
        <GrantCreditsDialog userId={userId} userName={userName} />
      </div>

      {!credits ? (
        <p role="alert" className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load this user&apos;s credits. Reload to try again.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card aria-labelledby="balance-title">
            <CardHeader>
              <CardTitle id="balance-title">Balance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p>
                <span className="text-h2 tabular-nums" data-testid="admin-balance">
                  {credits.balance}
                </span>{" "}
                <span className="text-muted-foreground">credits</span>
              </p>
              <p className="text-muted-foreground">
                {credits.spent_today} of {credits.daily_cap} spent today (UTC) · {titleCase(credits.plan)} plan
              </p>
            </CardContent>
          </Card>

          <Card aria-labelledby="buckets-title">
            <CardHeader>
              <CardTitle id="buckets-title">Buckets</CardTitle>
            </CardHeader>
            <CardContent>
              {credits.buckets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No credits left.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {credits.buckets.map((b) => (
                    <li key={b.id} className="flex items-baseline justify-between gap-3">
                      <span>
                        {sourceLabels[b.source]}
                        <span className="block text-xs text-muted-foreground">
                          {b.expires_at ? `Expires ${formatDate(b.expires_at)}` : "Never expires"}
                        </span>
                      </span>
                      <span className="tabular-nums">
                        {b.remaining} <span className="text-muted-foreground">of {b.granted}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card aria-labelledby="allowances-title">
            <CardHeader>
              <CardTitle id="allowances-title">This month</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {credits.allowances.map((a) => (
                  <li key={a.type} className="flex justify-between gap-3">
                    <span>{allowanceTitles[a.type] ?? a.type}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {a.limit === 0 ? "Not in plan" : `${a.used} of ${a.limit} used · ${allowanceRemaining(a)} left`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="font-medium" id="ledger-heading">
          Ledger
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit activity yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-sm" aria-labelledby="ledger-heading">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">What</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Bucket</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Credits</th>
                  <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const when = formatDateTime(r.createdAt);
                  return (
                    <tr key={r.key}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{when}</td>
                      <td className="px-4 py-2.5">{r.label}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{r.buckets}</td>
                      <td className={cn("px-4 py-2.5 text-right font-medium tabular-nums", r.delta > 0 && "text-primary")}>
                        {signedCredits(r.delta)}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {r.reservationId &&
                          (r.refunded ? (
                            <Badge variant="outline">Refunded</Badge>
                          ) : (
                            <RefundDialog userId={userId} reservationId={r.reservationId} label={r.label} credits={-r.delta} when={when} />
                          ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {entries.length >= LEDGER_LIMIT && (
          <p className="text-xs text-muted-foreground">Showing the newest {LEDGER_LIMIT} entries.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Admin changes</h3>
        <AuditList entries={(auditRes.data ?? []) as AdminAuditEntry[]} costLabels={costLabels} empty="No admin changes to this user yet." />
      </div>
    </section>
  );
}
