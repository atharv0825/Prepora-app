import Link from "next/link";
import { Coins } from "lucide-react";
import type { CreditBalance } from "@prepora/shared/api/credits";
import { spendableToday } from "@prepora/shared/api/credits";
import { Badge } from "@prepora/ui/components/badge";
import { buttonVariants } from "@prepora/ui/components/button";
import { cn } from "@prepora/ui/lib/utils";
import {
  type HistoryRow,
  allowanceMeters,
  creditsText,
  expiryText,
  formatDate,
  formatDateTime,
  meterPercent,
  signedCredits,
  sourceLabels,
} from "@/lib/credits";
import { planLabel } from "@/lib/dashboard";
import { routes } from "@/lib/routes";

// "Credits & usage" (M3-F1): balance, buckets with expiry, allowance meters, history from the
// ledger. Server components: the page loads everything in one request.

const cardClass = "flex flex-col gap-5 rounded-3xl border border-border bg-card p-6";

export function BalanceCard({ credits, timeZone }: { credits: CreditBalance; timeZone: string | null }) {
  const today = spendableToday(credits);
  return (
    <section aria-labelledby="balance-heading" className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="balance-heading" className="text-eyebrow text-muted-foreground">
          Balance
        </h2>
        <Badge variant="outline">{planLabel(credits.plan)} plan</Badge>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-h1 tabular-nums">{credits.balance}</span>
        <span className="text-muted-foreground">{credits.balance === 1 ? "credit" : "credits"}</span>
      </p>
      <Meter
        label="Used today"
        used={credits.spent_today}
        limit={credits.daily_cap}
        caption={`${credits.spent_today} of ${credits.daily_cap} daily credits used · ${today} left today`}
      />
      <p className="text-sm text-muted-foreground">
        The daily limit resets at midnight UTC.{" "}
        {credits.buckets.length > 0 && (
          <>Credits that expire soonest are used first ({expiryText(credits.buckets[0]!.expires_at, timeZone).replace(/^E/, "e")}).</>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href={routes.topUp} className={buttonVariants({ size: "sm" })}>
          Top up credits
        </Link>
        <Link href={routes.upgrade} className={buttonVariants({ size: "sm", variant: "outline" })}>
          See plans
        </Link>
      </div>
    </section>
  );
}

export function BucketList({ credits, timeZone }: { credits: CreditBalance; timeZone: string | null }) {
  return (
    <section aria-labelledby="buckets-heading" className={cardClass}>
      <h2 id="buckets-heading" className="text-eyebrow text-muted-foreground">
        Your credits
      </h2>
      {credits.buckets.length === 0 ? (
        <p className="text-muted-foreground">No credits right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {credits.buckets.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col">
                <span className="font-medium">{sourceLabels[b.source]}</span>
                <span className="text-sm text-muted-foreground">{expiryText(b.expires_at, timeZone)}</span>
              </div>
              <span className="tabular-nums">
                <span className="font-medium">{b.remaining}</span>
                <span className="text-muted-foreground"> of {b.granted}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AllowanceList({ credits }: { credits: CreditBalance }) {
  const since = formatDate(new Date(`${credits.period_start}T00:00:00Z`), "UTC");
  return (
    <section aria-labelledby="allowances-heading" className={cardClass}>
      <div className="flex flex-col gap-1">
        <h2 id="allowances-heading" className="text-eyebrow text-muted-foreground">
          This month&apos;s tests
        </h2>
        <p className="text-sm text-muted-foreground">Tests without AI scoring use a monthly allowance, not credits. Since {since}.</p>
      </div>
      <ul className="flex flex-col gap-4">
        {allowanceMeters(credits).map((a) => (
          <li key={a.type}>
            {a.included ? (
              <Meter label={a.title} used={a.used} limit={a.limit} caption={`${a.used} of ${a.limit} used`} />
            ) : (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{a.title}</span>
                <span className="text-sm text-muted-foreground">Not in your plan</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Meter({ label, used, limit, caption }: { label: string; used: number; limit: number; caption: string }) {
  const pct = meterPercent(used, limit);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{caption}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={caption}
        className="h-2 overflow-hidden rounded-full bg-secondary"
      >
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function HistoryList({ rows, timeZone }: { rows: HistoryRow[]; timeZone: string | null }) {
  return (
    <section aria-labelledby="history-heading" className={cardClass}>
      <h2 id="history-heading" className="text-eyebrow text-muted-foreground">
        History
      </h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="flex flex-col">
                <span className="font-medium">{r.label}</span>
                <span className="text-sm text-muted-foreground">
                  <time dateTime={r.createdAt}>{formatDateTime(new Date(r.createdAt), timeZone)}</time>
                </span>
              </div>
              <span
                className={cn("font-medium tabular-nums", r.delta > 0 ? "text-primary" : "text-foreground")}
                aria-label={`${r.delta > 0 ? "plus" : "minus"} ${creditsText(Math.abs(r.delta))}`}
              >
                {signedCredits(r.delta)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CreditsUnavailable() {
  return (
    <section className={cn(cardClass, "items-start")}>
      <span className="grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground">
        <Coins className="size-5" aria-hidden />
      </span>
      <p className="font-medium">We couldn&apos;t load your credits.</p>
      <p className="text-sm text-muted-foreground">Refresh the page to try again.</p>
    </section>
  );
}
