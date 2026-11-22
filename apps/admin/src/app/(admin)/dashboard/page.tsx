import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { dashboard, sectionModules } from "@/lib/nav";

export const metadata: Metadata = { title: "Dashboard" };

// Real numbers arrive with PostHog (M0-I2 / M11). Until then: labelled placeholders, no fake data.
const kpis = [
  { label: "Daily active users", source: "PostHog · M11" },
  { label: "Waitlist sign-ups", source: "waitlist table · M2" },
  { label: "Paid conversions", source: "Billing · M9" },
  { label: "AI cost this month", source: "ai_usage · M3/M6" },
];

const STUDENT_SITE = "https://staging.prepora.site";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-h2">Dashboard</h1>
          <p className="mt-1 text-muted-foreground">{dashboard.summary}</p>
        </div>
        <Badge variant="outline">Full dashboard in {dashboard.milestone}</Badge>
      </div>

      <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} size="sm">
            <CardContent className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className="font-heading text-3xl font-light tracking-tight text-muted-foreground/60">—</p>
              <p className="text-xs text-muted-foreground">{k.source}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
            <CardDescription>What each part of the admin panel will do, and when it arrives.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {sectionModules.map(({ slug, label, icon: Icon, milestone, summary }) => (
                <li key={slug}>
                  <Link href={`/${slug}`} className="group flex items-center gap-3 py-3">
                    <Icon className="size-4 shrink-0 text-brand-sea" strokeWidth={1.5} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium group-hover:underline">{label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{summary}</span>
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{milestone}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card variant="muted" className="mint h-fit">
          <CardHeader>
            <CardTitle>Student app (staging)</CardTitle>
            <CardDescription>Quick links while the dashboard is being built.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {[
              ["Landing page", `${STUDENT_SITE}/`],
              ["System status", `${STUDENT_SITE}/status`],
              ["Design system", `${STUDENT_SITE}/design`],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-xl bg-card px-3 py-2.5 hover:underline"
              >
                {label}
                <ArrowUpRight className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden />
              </a>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
