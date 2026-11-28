"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { type Offer, formatMoney } from "@prepora/shared/api/billing";
import { Badge } from "@prepora/ui/components/badge";
import { Button, buttonVariants } from "@prepora/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@prepora/ui/components/dialog";
import { toast } from "@prepora/ui/components/sonner";
import type { MySubscription } from "@/lib/billing";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";

const NAME = { free: "Free", gold: "Gold", platinum: "Platinum" } as const;
const RANK = { free: 0, gold: 1, platinum: 2 } as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

type Confirm = { kind: "cancel" } | { kind: "change"; offer: Offer } | null;

/**
 * M9-F3: "Manage subscription" in Settings. Shows the running plan (renews / ends / payment
 * failed / downgrade booked) and, for a monthly plan, Change plan, Cancel and (Paddle) the billing
 * portal: manage-subscription (M9-B5). Exam packs and plans given by support just show their end.
 */
export function SubscriptionSettings({ plan, subscription, monthly }: { plan: keyof typeof NAME; subscription: MySubscription | null; monthly: Offer[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function manage(body: Record<string, unknown>, done: string) {
    setBusy(true);
    const res = await invokeFunction<{ url?: string }>(createClient(), "manage-subscription", { body });
    setBusy(false);
    setConfirm(null);
    if (res.error) {
      toast.error(res.error.code === "internal" ? "Couldn't reach the payment provider. Please try again." : res.error.message);
      return;
    }
    if (res.data?.url) {
      window.open(res.data.url, "_blank", "noopener");
      return;
    }
    toast.success(done);
    router.refresh();
  }

  if (!subscription) {
    return (
      <Shell>
        <p className="text-sm">
          You&apos;re on <strong>{NAME[plan]}</strong>.
        </p>
        <Link href={routes.upgrade} className={buttonVariants({ size: "sm" })} data-testid="see-plans">
          See plans
        </Link>
      </Shell>
    );
  }

  const s = subscription;
  const monthlyPlan = s.kind === "subscription" && (s.provider === "razorpay" || s.provider === "paddle");
  const others = monthly.filter((o) => o.plan_id && o.plan_id !== s.plan_id);

  return (
    <Shell>
      <div className="flex flex-col gap-2" data-testid="subscription-status">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <strong>{NAME[s.plan_id]}</strong>
          <span className="text-muted-foreground">{s.kind === "exam_pack" ? "3-month exam pack" : s.provider === "manual" ? "given by support" : "monthly"}</span>
          {s.amount_minor !== null && s.currency && s.kind === "subscription" && (
            <span className="text-muted-foreground">· {formatMoney(s.amount_minor, s.currency)} a month</span>
          )}
          {s.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
          {s.cancel_at_period_end && s.status === "active" && monthlyPlan && <Badge variant="secondary">Cancelled</Badge>}
        </p>
        <p className="text-sm text-muted-foreground">
          {s.status === "past_due"
            ? `Your last renewal didn't go through. ${s.provider === "paddle" ? "Update your payment method in billing" : "Razorpay will retry your payment"}; you keep ${NAME[s.plan_id]} for a few days meanwhile.`
            : !monthlyPlan || s.cancel_at_period_end
              ? `Ends on ${day(s.current_period_end)}, then you're back on Free. It won't renew.`
              : `Renews on ${day(s.current_period_end)}.`}
        </p>
        {s.scheduled_plan_id && !s.cancel_at_period_end && (
          <p className="text-sm text-muted-foreground" data-testid="scheduled-change">
            Changes to {NAME[s.scheduled_plan_id]} on {day(s.current_period_end)}.
          </p>
        )}
      </div>

      {monthlyPlan && (
        <div className="flex flex-wrap gap-2">
          {s.provider === "paddle" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => manage({ action: "portal" }, "")}>
              Billing &amp; invoices <ExternalLink aria-hidden />
            </Button>
          )}
          {!s.cancel_at_period_end &&
            others.map((o) => (
              <Button key={o.id} size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ kind: "change", offer: o })} data-testid={`change-to-${o.plan_id}`}>
                {RANK[o.plan_id!] > RANK[s.plan_id] ? "Upgrade" : "Switch"} to {NAME[o.plan_id!]}
              </Button>
            ))}
          {!s.cancel_at_period_end && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ kind: "cancel" })} data-testid="cancel-subscription">
              Cancel subscription
            </Button>
          )}
        </div>
      )}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          {confirm?.kind === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel {NAME[s.plan_id]}?</DialogTitle>
                <DialogDescription>
                  You keep {NAME[s.plan_id]} and your credits until {day(s.current_period_end)}. After that you&apos;re on Free and won&apos;t be charged again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Keep my plan</DialogClose>
                <Button type="button" variant="destructive" disabled={busy} onClick={() => manage({ action: "cancel" }, `Cancelled. ${NAME[s.plan_id]} lasts until ${day(s.current_period_end)}.`)}>
                  {busy ? "Cancelling…" : "Cancel subscription"}
                </Button>
              </DialogFooter>
            </>
          )}
          {confirm?.kind === "change" && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {RANK[confirm.offer.plan_id!] > RANK[s.plan_id] ? "Upgrade" : "Switch"} to {NAME[confirm.offer.plan_id!]}?
                </DialogTitle>
                <DialogDescription>
                  {RANK[confirm.offer.plan_id!] > RANK[s.plan_id]
                    ? `It starts now. You pay the difference for the rest of this month, and get the extra credits straight away. From ${day(s.current_period_end)} it's ${formatMoney(confirm.offer.amount_minor, confirm.offer.currency)} a month.`
                    : `You keep ${NAME[s.plan_id]} until ${day(s.current_period_end)}. Then it's ${NAME[confirm.offer.plan_id!]} at ${formatMoney(confirm.offer.amount_minor, confirm.offer.currency)} a month.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Not now</DialogClose>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    manage(
                      { action: "change_plan", price_id: confirm.offer.id },
                      RANK[confirm.offer.plan_id!] > RANK[s.plan_id]
                        ? `Upgrading to ${NAME[confirm.offer.plan_id!]}: it shows here once the payment goes through.`
                        : `Booked: ${NAME[confirm.offer.plan_id!]} from ${day(s.current_period_end)}.`,
                    )
                  }
                >
                  {busy ? "Working…" : "Confirm"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section id="subscription" aria-labelledby="subscription-heading" className="flex scroll-mt-24 flex-col gap-3 border-t border-border pt-6">
      <h2 id="subscription-heading" className="text-sm font-medium">
        Subscription
      </h2>
      {children}
    </section>
  );
}
