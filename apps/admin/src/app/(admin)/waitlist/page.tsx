import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Download, Filter } from "lucide-react";
import {
  ADMIN_WAITLIST_PAGE_SIZE,
  UNKNOWN_COUNTRY,
  adminWaitlistSearch,
  parseAdminWaitlistQuery,
  type AdminWaitlistQuery,
  type WaitlistEntry,
} from "@prepora/shared/api/admin-waitlist";
import { Badge } from "@prepora/ui/components/badge";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import { AdminOnly } from "@/components/admin-only";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countryName, formatDate, formatDateTime } from "@/lib/users";
import { waitlistSelect } from "@/lib/waitlist";

export const metadata: Metadata = { title: "Waitlist" };

// M2-A2: the beta waitlist, filtered by country and status (waiting / invited / all), 50 per
// page, newest first, with a CSV export of the same filters. Admins only (RLS). Invites: M12.

const selectClass =
  "h-11 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

const statusLabels: Record<AdminWaitlistQuery["status"], string> = {
  waiting: "Still waiting",
  invited: "Invited",
  all: "Everyone",
};

export default async function WaitlistPage({ searchParams }: PageProps<"/waitlist">) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const query = parseAdminWaitlistQuery(await searchParams);
  const supabase = await createClient();
  const from = (query.page - 1) * ADMIN_WAITLIST_PAGE_SIZE;
  const [{ data, count, error }, { data: counts }] = await Promise.all([
    waitlistSelect(supabase, query).range(from, from + ADMIN_WAITLIST_PAGE_SIZE - 1),
    supabase.rpc("admin_waitlist_by_country"),
  ]);
  if (error) console.error("waitlist failed", error.code, error.message);

  const rows = (data ?? []) as WaitlistEntry[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_WAITLIST_PAGE_SIZE));
  // Filter options: countries people joined from (with counts), plus the one in the URL.
  const countryOptions = (counts ?? [])
    .filter((c) => c.country_code)
    .map((c) => ({ code: c.country_code!, label: `${countryName(c.country_code)} (${c.waiting + c.invited})` }));
  if (query.country && query.country !== UNKNOWN_COUNTRY && !countryOptions.some((c) => c.code === query.country)) {
    countryOptions.push({ code: query.country, label: countryName(query.country) });
  }
  countryOptions.sort((a, b) => a.label.localeCompare(b.label));
  const exportHref = `/waitlist/export${adminWaitlistSearch({ country: query.country, status: query.status })}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
            <ClipboardList className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h1 className="text-h2">Waitlist</h1>
            <p className="mt-1 text-muted-foreground">People waiting for sign-up to open in their country.</p>
          </div>
        </div>
        {/* A plain link: the browser downloads the file (Content-Disposition). */}
        <a href={exportHref} className={buttonVariants({ variant: "outline" })} download>
          <Download /> Export CSV
        </a>
      </div>

      <form method="get" role="search" aria-label="Filter the waitlist" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Country
          <select name="country" defaultValue={query.country ?? ""} className={selectClass}>
            <option value="">All countries</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
            <option value={UNKNOWN_COUNTRY}>Unknown country</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select name="status" defaultValue={query.status} className={selectClass}>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" className="self-start sm:self-auto">
          <Filter /> Apply
        </Button>
      </form>

      {error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load the waitlist. Please try again.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total === 0 ? "Nobody here." : `${total.toLocaleString("en")} ${total === 1 ? "person" : "people"}`}
          </p>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Email</th>
                    <th scope="col" className="px-4 py-3 font-medium">Country</th>
                    <th scope="col" className="px-4 py-3 font-medium">Source</th>
                    <th scope="col" className="px-4 py-3 font-medium">Joined</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((w) => (
                    <tr key={w.id}>
                      <td className="px-4 py-3 break-all">{w.email}</td>
                      <td className="px-4 py-3">{w.country_code ? countryName(w.country_code) : "Unknown"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{w.source ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(w.created_at)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {w.invited_at ? (
                          <Badge variant="secondary" title={formatDateTime(w.invited_at)}>
                            Invited
                          </Badge>
                        ) : (
                          <Badge variant="outline">Waiting</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3">
              <PageLink query={query} page={query.page - 1} disabled={query.page <= 1}>
                <ChevronLeft /> Previous
              </PageLink>
              <span className="text-sm text-muted-foreground">
                Page {Math.min(query.page, pages)} of {pages}
              </span>
              <PageLink query={query} page={query.page + 1} disabled={query.page >= pages}>
                Next <ChevronRight />
              </PageLink>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  children,
}: {
  query: AdminWaitlistQuery;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Link href={`/waitlist${adminWaitlistSearch({ ...query, page })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
