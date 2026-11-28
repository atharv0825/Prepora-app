import type { Metadata } from "next";
import { CheckoutWaiter } from "@/components/billing/checkout-waiter";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment · Prepora", robots: { index: false } };

// M9-F2: where checkout lands after the provider says "paid". The plan or credits change only when
// the provider's webhook has been applied (billing-webhook), usually within seconds: this page
// waits for that, then shows what changed. ?price=<prices.id>&since=<ms> (set by BuyButton).
export default async function CheckoutDonePage({ searchParams }: PageProps<"/app/plans/success">) {
  const sp = await searchParams;
  const priceId = typeof sp.price === "string" ? sp.price : "";
  const since = Number(typeof sp.since === "string" ? sp.since : NaN);
  const supabase = await createClient();
  const { data: price } = /^[a-z][a-z0-9_]{2,59}$/.test(priceId)
    ? await supabase.from("prices").select("id, kind, plan_id, credits").eq("id", priceId).maybeSingle()
    : { data: null };

  return (
    <div className="flex w-full max-w-lg flex-col gap-6 py-8">
      {price ? (
        <CheckoutWaiter
          bought={{ kind: price.kind, plan_id: price.plan_id, credits: price.credits }}
          since={Number.isFinite(since) ? since : null}
        />
      ) : (
        <p role="status" className="rounded-2xl border border-border bg-card px-4 py-3">
          Thanks! If you just paid, your plan or credits appear within a minute. Check your credits page.
        </p>
      )}
    </div>
  );
}
