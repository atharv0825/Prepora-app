"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateCheckoutResponse, billingErrorMessages } from "@prepora/shared/api/billing";
import { Button } from "@prepora/ui/components/button";
import { toast } from "@prepora/ui/components/sonner";
import { openPaddle, openRazorpay } from "@/lib/checkout-providers";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/client";
import { invokeFunction } from "@/lib/supabase/functions";

/**
 * M9-F2: Buy → create-checkout → the provider's checkout in the page → the success page, which
 * waits for the webhook. Nothing changes the plan here; closing the checkout just returns.
 */
export function BuyButton({
  priceId,
  label,
  email,
  variant = "default",
  className,
  testId,
}: {
  priceId: string;
  label: string;
  email?: string | null;
  variant?: "default" | "outline";
  className?: string;
  testId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function buy() {
    setBusy(true);
    // A little before now, so a webhook that beats a slow clock still counts on the success page.
    const since = Date.now() - 2 * 60_000;
    try {
      const res = await invokeFunction<unknown>(createClient(), "create-checkout", { body: { price_id: priceId } });
      if (res.error) {
        const known = res.error.code === "price_not_available" || res.error.code === "already_subscribed";
        toast.error(known ? res.error.message || billingErrorMessages[res.error.code as "price_not_available"] : "Couldn't start checkout. Please try again.");
        if (res.error.code === "already_subscribed") router.push(routes.subscription);
        return;
      }
      const checkout = CreateCheckoutResponse.parse(res.data);
      const outcome = checkout.provider === "razorpay" ? await openRazorpay(checkout) : await openPaddle(checkout, { email });
      if (outcome === "paid") router.push(`${routes.checkoutDone}?price=${encodeURIComponent(priceId)}&since=${since}`);
    } catch (err) {
      console.error("checkout failed", err);
      toast.error("Couldn't open the payment window. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant={variant} onClick={buy} disabled={busy} className={className} data-testid={testId}>
      {busy ? "Opening checkout…" : label}
    </Button>
  );
}
