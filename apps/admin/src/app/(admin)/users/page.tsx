import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import {
  adminListUsersArgs,
  adminUsersSearch,
  pageCount,
  parseAdminUsersQuery,
  type AdminUserRow,
} from "@prepora/shared/api/admin-users";
import { plans } from "@prepora/shared/types/profile";
import { Badge } from "@prepora/ui/components/badge";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { AdminOnly } from "@/components/admin-only";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { countryName, formatDate, formatDateTime, titleCase } from "@/lib/users";

export const metadata: Metadata = { title: "Users" };

// M2-A1: users list. Search by email or name, filter by country and plan, 25 per page, newest
// first. Everything is in the URL (?q=&country=&plan=&page=), so a filtered list is a shareable
// link and the form works without JavaScript. Data comes from admin_list_users (admins only,
// checked in the database); the layout has already let only staff in.

const selectClass =
  "h-11 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40";

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const query = parseAdminUsersQuery(await searchParams);
  const supabase = await createClient();
  const [{ data, error }, { data: countries }] = await Promise.all([
    supabase.rpc("admin_list_users", adminListUsersArgs(query)),
    supabase.from("country_regions").select("country_code").order("country_code"),
  ]);

  if (error?.code === "42501") return <AdminOnly />;
  if (error) console.error("admin_list_users failed", error.code, error.message);

  const rows = (data ?? []) as AdminUserRow[];
  const total = rows[0]?.total_count ?? 0;
  const pages = pageCount(total);
  const filtered = Boolean(query.q || query.country || query.plan);
  // Countries in the filter: every listed country, plus the one in the URL if it isn't listed.
  const countryOptions = [...new Set([...(countries ?? []).map((c) => c.country_code), ...(query.country ? [query.country] : [])])]
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <Users className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Users</h1>
          <p className="mt-1 text-muted-foreground">Search by email or name, filter by country and plan.</p>
        </div>
      </div>

      <form method="get" role="search" aria-label="Filter users" className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
          Email or name
          <Input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="asha@example.com or Asha Rao"
            maxLength={100}
            className="h-11"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Country
          <select name="country" defaultValue={query.country ?? ""} className={selectClass}>
            <option value="">All countries</option>
            {countryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Plan
          <select name="plan" defaultValue={query.plan ?? ""} className={selectClass}>
            <option value="">All plans</option>
            {plans.map((p) => (
              <option key={p} value={p}>
                {titleCase(p)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button type="submit">
            <Search /> Search
          </Button>
          {filtered && (
            <Link href="/users" className={buttonVariants({ variant: "ghost" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {error ? (
        <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load users. Please try again.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {total === 0
              ? filtered
                ? "No users match these filters."
                : "No users yet."
              : `${total.toLocaleString("en")} ${total === 1 ? "user" : "users"}${filtered ? " found" : ""}`}
          </p>
          {rows.length > 0 && <UsersTable rows={rows} />}
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

function UsersTable({ rows }: { rows: AdminUserRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">User</th>
            <th scope="col" className="px-4 py-3 font-medium">Country</th>
            <th scope="col" className="px-4 py-3 font-medium">Plan</th>
            <th scope="col" className="px-4 py-3 font-medium">Joined</th>
            <th scope="col" className="px-4 py-3 font-medium">Last sign-in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((u) => (
            <tr key={u.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <Link href={`/users/${u.id}`} className="group flex flex-col">
                  <span className="font-medium group-hover:underline">{u.full_name || "No name"}</span>
                  <span className="text-muted-foreground">{u.email ?? "—"}</span>
                </Link>
              </td>
              <td className="px-4 py-3">{countryName(u.country_code)}</td>
              <td className="px-4 py-3">
                <span className="flex flex-wrap gap-1.5">
                  <Badge variant={u.plan === "free" ? "outline" : "default"}>{titleCase(u.plan)}</Badge>
                  {u.role !== "user" && <Badge variant="secondary">{titleCase(u.role)}</Badge>}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(u.created_at)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(u.last_sign_in_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  children,
}: {
  query: ReturnType<typeof parseAdminUsersQuery>;
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
    <Link href={`/users${adminUsersSearch({ ...query, page })}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {children}
    </Link>
  );
}
