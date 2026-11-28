"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CreateCheckoutResponse, MIN_UPGRADE_MINOR, type Offer, formatMoney, packUpgradeQuote } from "@prepora/shared/api/billing";
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
import { openPaddle, openRazorpay } from "@/lib/checkout-providers";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";

const NAME = { free: "Free", gold: "Gold", platinum: "Platinum" } as const;
const RANK = { free: 0, gold: 1, platinum: 2 } as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

type Quote = { amount_minor: number; credits: number; days_left: number };
type Confirm = { kind: "cancel" } | { kind: "change"; offer: Offer } | { kind: "pack"; offer: Offer; quote: Quote } | null;

/**
 * M9-F3: "Manage subscription" in Settings. Shows the running plan (renews / ends / payment
 * failed / downgrade booked) and, for a monthly plan, Change plan, Cancel and (Paddle) the billing
 * portal: manage-subscription (M9-B5). An exam pack can be upgraded to a higher plan's pack for the
 * days left (pay the prorated difference in the provider's checkout); plans given by support just
 * show their end.
 */
export function SubscriptionSettings({
  plan,
  subscription,
  monthly,
  packs,
}: {
  plan: keyof typeof NAME;
  subscription: MySubscription | null;
  monthly: Offer[];
  packs: Offer[];
}) {
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
    // A Razorpay plan change: approve the new subscription (and pay an upgrade's difference).
    const checkout = (res.data as { checkout?: unknown } | null)?.checkout;
    if (checkout) {
      const since = Date.now() - 2 * 60_000;
      try {
        const c = CreateCheckoutResponse.parse(checkout);
        const outcome = c.provider === "razorpay" ? await openRazorpay(c) : await openPaddle(c);
        if (outcome !== "paid") return;
        const offer = typeof body.price_id === "string" ? monthly.find((o) => o.id === body.price_id) : undefined;
        if (offer && subscription && RANK[offer.plan_id!] > RANK[subscription.plan_id]) {
          router.push(`${routes.checkoutDone}?price=${encodeURIComponent(offer.id)}&since=${since}`);
          return;
        }
      } catch (err) {
        console.error("plan change checkout failed", err);
        toast.error("Couldn't open the payment window. Check your connection and try again.");
        return;
      }
    }
    toast.success(done);
    router.refresh();
  }

  /** Exam pack upgrade: manage-subscription returns a checkout; pay it like a purchase. */
  async function upgradePack(offer: Offer) {
    setBusy(true);
    const since = Date.now() - 2 * 60_000;
    try {
      const res = await invokeFunction<{ checkout?: unknown }>(createClient(), "manage-subscription", { body: { action: "change_plan", price_id: offer.id } });
      if (res.error) {
        toast.error(res.error.code === "internal" ? "Couldn't reach the payment provider. Please try again." : res.error.message);
        return;
      }
      const checkout = CreateCheckoutResponse.parse(res.data?.checkout);
      setConfirm(null);
      const outcome = checkout.provider === "razorpay" ? await openRazorpay(checkout) : await openPaddle(checkout);
      if (outcome === "paid") router.push(`${routes.checkoutDone}?price=${encodeURIComponent(offer.id)}&since=${since}`);
    } catch (err) {
      console.error("pack upgrade failed", err);
      toast.error("Couldn't open the payment window. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
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
  const paidPack = s.kind === "exam_pack" && (s.provider === "razorpay" || s.provider === "paddle");
  const packUpgrades = paidPack ? packs.filter((o) => o.plan_id && RANK[o.plan_id] > RANK[s.plan_id]) : [];
  const quoteFor = (o: Offer): Quote =>
    packUpgradeQuote({
      fromAmountMinor: s.amount_minor ?? 0,
      toAmountMinor: o.amount_minor,
      fromCredits: s.price_credits ?? 0,
      toCredits: o.credits ?? 0,
      start: s.current_period_start,
      end: s.current_period_end,
    });

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
              ? `Ends on ${day(s.current_period_end)}, then you're back on Free. It won't renew.${packUpgrades.length > 0 ? " You can upgrade it for the days left." : ""}`
              : `Renews on ${day(s.current_period_end)}.`}
        </p>
        {s.scheduled_plan_id && s.scheduled_plan_id !== s.plan_id && !s.cancel_at_period_end && (
          <p className="text-sm text-muted-foreground" data-testid="scheduled-change">
            Changes to {NAME[s.scheduled_plan_id]} on {day(s.current_period_end)}.
          </p>
        )}
      </div>

      {packUpgrades.length > 0 && s.status === "active" && (
        <div className="flex flex-wrap gap-2">
          {packUpgrades.map((o) => (
            <Button
              key={o.id}
              size="sm"
              disabled={busy}
              // The quote depends on today's date: taken when the button is pressed.
              onClick={() => setConfirm({ kind: "pack", offer: o, quote: quoteFor(o) })}
              data-testid={`upgrade-pack-to-${o.plan_id}`}
            >
              Upgrade to {NAME[o.plan_id!]}
            </Button>
          ))}
        </div>
      )}

      {monthlyPlan && (
        <div className="flex flex-wrap gap-2">
          {s.provider === "paddle" && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => manage({ action: "portal" }, "")}>
              Billing &amp; invoices <ExternalLink aria-hidden />
            </Button>
          )}
          {!s.cancel_at_period_end &&
            !s.scheduled_plan_id &&
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
                  {s.provider === "razorpay" && " You'll approve the new plan in Razorpay (UPI or card); your current one then stops renewing."}
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
          {confirm?.kind === "pack" && (
            <>
              <DialogHeader>
                <DialogTitle>Upgrade your pack to {NAME[confirm.offer.plan_id!]}?</DialogTitle>
                <DialogDescription>
                  {confirm.quote.amount_minor < MIN_UPGRADE_MINOR
                    ? "Your pack ends too soon to upgrade it."
                    : `${NAME[confirm.offer.plan_id!]} from now until ${day(s.current_period_end)}, the same end date. For the ${confirm.quote.days_left} days left you pay ${formatMoney(confirm.quote.amount_minor, confirm.offer.currency)} once and get ${confirm.quote.credits} extra credits straight away.`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Not now</DialogClose>
                {confirm.quote.amount_minor >= MIN_UPGRADE_MINOR && (
                  <Button type="button" disabled={busy} onClick={() => upgradePack(confirm.offer)} data-testid="confirm-pack-upgrade">
                    {busy ? "Opening checkout…" : `Pay ${formatMoney(confirm.quote.amount_minor, confirm.offer.currency)}`}
                  </Button>
                )}
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
