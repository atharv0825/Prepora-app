import type { Metadata } from "next";
import Link from "next/link";
import { Globe } from "lucide-react";
import { adminWaitlistSearch } from "@prepora/shared/api/admin-waitlist";
import { Badge } from "@prepora/ui/components/badge";
import { AdminOnly } from "@/components/admin-only";
import { CountrySwitch } from "@/components/country-switch";
import { groupByWave, regionLabel } from "@/lib/countries";
import { getViewer } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Countries" };

// M2-A2: launch waves. One switch per country opens or closes sign-up there (the country gate,
// M2-F1, reads country_regions.is_enabled on every /signup visit, so it takes effect at once).
// The waiting count links to that country's waitlist. Admins only (RLS decides the write).
export default async function CountriesPage() {
  const viewer = await getViewer();
  if (viewer?.role !== "admin") return <AdminOnly />;

  const supabase = await createClient();
  const [{ data: countries, error }, { data: counts }] = await Promise.all([
    supabase.from("country_regions").select("country_code, region, launch_wave, is_enabled"),
    supabase.rpc("admin_waitlist_by_country"),
  ]);
  if (error) throw new Error(`country_regions failed: ${error.code}`);

  const waiting = new Map<string, number>();
  let unknownWaiting = 0;
  for (const c of counts ?? []) {
    if (c.country_code) waiting.set(c.country_code, c.waiting);
    else unknownWaiting = c.waiting;
  }
  const groups = groupByWave(countries ?? [], waiting);
  const open = groups.reduce((n, g) => n + g.enabled, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
          <Globe className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div>
          <h1 className="text-h2">Countries</h1>
          <p className="mt-1 text-muted-foreground">
            Sign-up is open in {open} of {countries?.length ?? 0} countries. Everyone else sees the waitlist.
          </p>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`wave-${g.wave ?? "none"}`} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 id={`wave-${g.wave ?? "none"}`} className="text-h3">
              {g.title}
            </h2>
            <Badge variant="outline">
              {g.enabled} of {g.countries.length} open
            </Badge>
          </div>
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {g.countries.map((c) => (
              <li key={c.country_code} className="flex items-center gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {c.name} <span className="font-mono text-xs text-muted-foreground">{c.country_code}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{regionLabel(c.region)}</span>
                </div>
                <Link
                  href={`/waitlist${adminWaitlistSearch({ country: c.country_code })}`}
                  className="hidden text-sm whitespace-nowrap text-muted-foreground hover:text-foreground hover:underline sm:block"
                >
                  {c.waiting} waiting
                </Link>
                <span
                  className={c.is_enabled ? "w-14 text-right text-sm font-medium" : "w-14 text-right text-sm text-muted-foreground"}
                  aria-hidden
                >
                  {c.is_enabled ? "Open" : "Waitlist"}
                </span>
                <CountrySwitch code={c.country_code} name={c.name} enabled={c.is_enabled} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {unknownWaiting > 0 && (
        <p className="text-sm text-muted-foreground">
          {unknownWaiting} more {unknownWaiting === 1 ? "person is" : "people are"} waiting from an unknown country.{" "}
          <Link href={`/waitlist${adminWaitlistSearch({ country: "unknown" })}`} className="underline underline-offset-4">
            See them
          </Link>
        </p>
      )}
    </div>
  );
}
