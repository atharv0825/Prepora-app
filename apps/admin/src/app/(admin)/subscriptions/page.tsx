import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleAlert, Receipt, Search } from "lucide-react";
import { AdminBillingSummary, type AdminSubscriptionRow, SUBSCRIPTIONS_PAGE_SIZE } from "@prepora/shared/api/admin-billing";
import { formatMoney } from "@prepora/shared/api/billing";
import { Constants } from "@prepora/shared/db";
import { Badge } from "@prepora/ui/components/badge";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { Input } from "@prepora/ui/components/input";
import { AdminOnly } from "@/components/admin-only";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate, titleCase } from "@/lib/users";

export const metadata: Metadata = { title: "Subscriptions" };

// M9-A1: revenue by currency (never converted), live subscriptions and webhooks that haven't been
// applied, then every subscription, newest first, filtered by status and email or name. Filters
// live in the URL (?q=&status=&page=). Manual plan changes are on each user's page. Admins only
// (admin_* RPCs check is_admin()).

const statuses = Constants.public.Enums.subscription_status;
type Status = (typeof statuses)[number];

const selectClass =
  "h-11 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const KIND_LABEL = { subscription: "Monthly", exam_pack: "Exam pack", topup: "Top-up" } as const;

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SubscriptionsPage({ searchParams }: PageProps<"/subscriptions">) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const sp = await searchParams;
  const q = one(sp.q)?.trim().slice(0, 100) || undefined;
  const statusParam = one(sp.status);
  const status = statuses.includes(statusParam as Status) ? (statusParam as Status) : undefined;
  const page = Math.max(1, Number.parseInt(one(sp.page) ?? "1", 10) || 1);

  const supabase = await createClient();
  const [list, summaryRes] = await Promise.all([
    supabase.rpc("admin_list_subscriptions", {
      p_status: status as Status,
      p_search: q as string,
      p_limit: SUBSCRIPTIONS_PAGE_SIZE,
      p_offset: (page - 1) * SUBSCRIPTIONS_PAGE_SIZE,
    }),
    supabase.rpc("admin_billing_summary"),
  ]);
  if (list.error?.code === "42501") return <AdminOnly />;
  if (list.error) console.error("admin_list_subscriptions failed", list.error.code, list.error.message);
  if (summaryRes.error) console.error("admin_billing_summary failed", summaryRes.error.code, summaryRes.error.message);

  const rows = (list.data ?? []) as AdminSubscriptionRow[];
  const total = Number(rows[0]?.total_count ?? 0);
  const pages = Math.max(1, Math.ceil(total / SUBSCRIPTIONS_PAGE_SIZE));
  const parsed = AdminBillingSummary.safeParse(summaryRes.data);
  const summary = parsed.success ? parsed.data : null;
  const filtered = Boolean(q || status);
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/subscriptions?${s}` : "/subscriptions";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <Receipt className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Subscriptions</h1>
          <p className="mt-1 text-muted-foreground">Revenue by currency and every paid plan. Change a student&apos;s plan by hand on their user page.</p>
        </div>
      </div>

      {summary ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Revenue by currency</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.revenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm" data-testid="revenue">
                    <thead className="text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-2 font-medium">Currency</th>
                        <th scope="col" className="py-2 font-medium">Payments</th>
                        <th scope="col" className="py-2 font-medium">Net, last 30 days</th>
                        <th scope="col" className="py-2 font-medium">Net, all time</th>
                        <th scope="col" className="py-2 font-medium">Refunded</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {summary.revenue.map((r) => (
                        <tr key={r.currency}>
                          <td className="py-2 font-medium">{r.currency}</td>
                          <td className="py-2 tabular-nums">{r.payments}</td>
                          <td className="py-2 tabular-nums">{formatMoney(r.net_30d_minor, r.currency)}</td>
                          <td className="py-2 tabular-nums">{formatMoney(r.net_minor, r.currency)}</td>
                          <td className="py-2 tabular-nums text-muted-foreground">{formatMoney(r.refunded_minor, r.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-muted-foreground">
                    What students paid, before provider fees and tax. Paddle charges some countries in their own currency, so those appear as their own rows.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Live now</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                <dt>Gold</dt>
                <dd className="tabular-nums">{summary.active.gold}</dd>
                <dt>Platinum</dt>
                <dd className="tabular-nums">{summary.active.platinum}</dd>
                <dt>Cancelling at period end</dt>
                <dd className="tabular-nums">{summary.active.cancelling}</dd>
                <dt>Past due (grace period)</dt>
                <dd className="tabular-nums">{summary.active.past_due}</dd>
              </dl>
              {summary.unprocessed_events > 0 && (
                <p className="mt-4 flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {summary.unprocessed_events} webhook{summary.unprocessed_events === 1 ? "" : "s"} not applied
                  {summary.failed_events > 0 ? ` (${summary.failed_events} failed)` : ""}. The provider retries; check payment_events if it lasts.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <p role="alert" className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load revenue. Reload to try again.
        </p>
      )}

      <form method="get" role="search" aria-label="Filter subscriptions" className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Email or name
          <Input type="search" name="q" defaultValue={q ?? ""} placeholder="asha@example.com or Asha Rao" maxLength={100} className="h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={status ?? ""} className={selectClass}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {titleCase(s.replace("_", " "))}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit">
            <Search /> Search
          </Button>
          {filtered && (
            <Link href="/subscriptions" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {list.error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load subscriptions. Please try again.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total === 0 ? (filtered ? "No subscriptions match these filters." : "No subscriptions yet.") : `${total.toLocaleString("en")} ${total === 1 ? "subscription" : "subscriptions"}`}
          </p>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[820px] text-left text-sm" data-testid="subscriptions">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Student</th>
                    <th scope="col" className="px-4 py-3 font-medium">Plan</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 font-medium">Paid</th>
                    <th scope="col" className="px-4 py-3 font-medium">Period ends</th>
                    <th scope="col" className="px-4 py-3 font-medium">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/40">
                      <td className="px-4 py-3">
                        <Link href={`/users/${s.user_id}`} className="group flex flex-col">
                          <span className="font-medium group-hover:underline">{s.full_name || "No name"}</span>
                          <span className="text-muted-foreground">{s.email ?? "—"}</span>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {titleCase(s.plan_id)} · {KIND_LABEL[s.kind]}
                        {s.scheduled_plan_id && <span className="block text-xs text-muted-foreground">→ {titleCase(s.scheduled_plan_id)} at period end</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap gap-1.5">
                          <Badge variant={s.status === "active" ? "default" : s.status === "past_due" ? "destructive" : "outline"}>{titleCase(s.status.replace("_", " "))}</Badge>
                          {s.cancel_at_period_end && s.status === "active" && <Badge variant="secondary">Cancelling</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {s.amount_minor !== null && s.currency ? formatMoney(s.amount_minor, s.currency) : "—"}
                        <span className="block text-xs text-muted-foreground">{titleCase(s.provider)}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.current_period_end)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              {page <= 1 ? (
                <Button variant="outline" size="sm" disabled>
                  <ChevronLeft /> Previous
                </Button>
              ) : (
                <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ChevronLeft /> Previous
                </Link>
              )}
              <span className="text-sm text-muted-foreground">
                Page {Math.min(page, pages)} of {pages}
              </span>
              {page >= pages ? (
                <Button variant="outline" size="sm" disabled>
                  Next <ChevronRight />
                </Button>
              ) : (
                <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Next <ChevronRight />
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
