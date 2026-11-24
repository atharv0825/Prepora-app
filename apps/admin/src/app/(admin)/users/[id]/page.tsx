import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { AdminUserDetail } from "@prepora/shared/api/admin-users";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { AdminOnly } from "@/components/admin-only";
import { UserCredits } from "@/components/user-credits";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { bandLabel, countryName, formatDate, formatDateTime, isUuid, testTypeLabel, titleCase } from "@/lib/users";

export const metadata: Metadata = { title: "User", robots: { index: false } };

// M2-A1: one user's profile (read-only). Progress, plan changes and suspension come with later
// milestones (plan §6). Data from admin_get_user (admins only, checked in the database).
// M3-A2: their credits below: balance, ledger, grant and refund (components/user-credits.tsx).
export default async function UserPage({ params }: PageProps<"/users/[id]">) {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_get_user", { p_id: id });
  if (error?.code === "42501") return <AdminOnly />;
  if (error) throw new Error(`admin_get_user failed: ${error.code}`);
  const user = (data as AdminUserDetail[] | null)?.[0];
  if (!user) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/users" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All users
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 break-words">{user.full_name || "No name"}</h1>
          <p className="mt-1 break-all text-muted-foreground">{user.email ?? "—"}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={user.plan === "free" ? "outline" : "default"}>{titleCase(user.plan)} plan</Badge>
          {user.role !== "user" && <Badge variant="secondary">{titleCase(user.role)}</Badge>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Account"
          rows={[
            ["Joined", formatDateTime(user.created_at, "—")],
            ["Last sign-in", formatDateTime(user.last_sign_in_at)],
            ["Signs in with", titleCase(user.auth_provider)],
            ["Profile updated", formatDateTime(user.updated_at, "—")],
            ["User ID", <code key="id" className="font-mono text-xs break-all">{user.id}</code>],
          ]}
        />
        <Section
          title="Location"
          rows={[
            ["Country", user.country_code ? `${countryName(user.country_code)} (${user.country_code})` : "—"],
            ["Time zone", user.timezone ?? "—"],
          ]}
        />
        <Section
          title="IELTS goal"
          rows={[
            ["Test", testTypeLabel(user.test_type)],
            ["Target band", bandLabel(user.target_band)],
            ["Exam date", user.exam_date ? formatDate(user.exam_date) : "Not booked"],
          ]}
        />
        <Section
          title="Progress"
          rows={[["Practice history", "Arrives with the practice modules (M4–M7)."]]}
        />
      </div>

      <UserCredits userId={user.id} userName={user.full_name || user.email || "this user"} />
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
