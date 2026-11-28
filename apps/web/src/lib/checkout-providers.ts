"use client";

// M9-F2: open the provider's checkout in the page. Their scripts load only when a student
// presses Buy, from the providers' own CDNs (they must not be bundled or self-hosted).
//   Razorpay Checkout: UPI (AutoPay for subscriptions), cards, netbanking. India.
//   Paddle overlay checkout (Paddle.js v2): cards and local methods, local currency, tax. Others.
import type { PaddleCheckout, RazorpayCheckout } from "@prepora/shared/api/billing";

const RAZORPAY_JS = "https://checkout.razorpay.com/v1/checkout.js";
const PADDLE_JS = "https://cdn.paddle.com/paddle/v2/paddle.js";

const loading = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  let p = loading.get(src);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loading.delete(src);
        s.remove();
        reject(new Error(`Couldn't load ${src}`));
      };
      document.head.appendChild(s);
    });
    loading.set(src, p);
  }
  return p;
}

type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: unknown) => void) => void };
type PaddleGlobal = {
  Environment: { set: (env: "sandbox") => void };
  Initialize: (opts: { token: string; eventCallback?: (e: { name?: string }) => void }) => void;
  Checkout: { open: (opts: Record<string, unknown>) => void; close?: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
    Paddle?: PaddleGlobal;
  }
}

export type CheckoutOutcome = "paid" | "closed";

/** Opens Razorpay Checkout; resolves "paid" when the payment (or mandate) succeeds, "closed" if dismissed. */
export async function openRazorpay(c: RazorpayCheckout, opts: { brandColor?: string } = {}): Promise<CheckoutOutcome> {
  await loadScript(RAZORPAY_JS);
  if (!window.Razorpay) throw new Error("Razorpay didn't load");
  const Razorpay = window.Razorpay;
  return new Promise((resolve) => {
    const rzp = new Razorpay({
      key: c.key_id,
      name: "Prepora",
      description: c.description,
      ...(c.mode === "subscription" ? { subscription_id: c.subscription_id } : { order_id: c.order_id, amount: c.amount_minor, currency: c.currency }),
      prefill: c.prefill,
      theme: { color: opts.brandColor ?? "#0f766e" },
      handler: () => resolve("paid"),
      modal: { ondismiss: () => resolve("closed"), confirm_close: true },
    });
    rzp.open();
  });
}

// Paddle.js is initialised once per page; each checkout swaps in its own completion callback.
let paddleReady: string | null = null;
let paddleListener: ((name: string) => void) | null = null;

/** Opens Paddle's overlay checkout; resolves "paid" on checkout.completed, "closed" if closed first. */
export async function openPaddle(c: PaddleCheckout, opts: { email?: string | null } = {}): Promise<CheckoutOutcome> {
  await loadScript(PADDLE_JS);
  const Paddle = window.Paddle;
  if (!Paddle) throw new Error("Paddle didn't load");
  if (paddleReady !== c.client_token) {
    if (c.environment === "sandbox") Paddle.Environment.set("sandbox");
    Paddle.Initialize({ token: c.client_token, eventCallback: (e) => e.name && paddleListener?.(e.name) });
    paddleReady = c.client_token;
  }
  return new Promise((resolve) => {
    let paid = false;
    paddleListener = (name) => {
      if (name === "checkout.completed") {
        paid = true;
        // The overlay is outside React: close it before the app moves to the success page.
        window.Paddle?.Checkout.close?.();
        resolve("paid");
      } else if (name === "checkout.closed" && !paid) resolve("closed");
    };
    Paddle.Checkout.open({
      transactionId: c.transaction_id,
      ...(opts.email ? { customer: { email: opts.email } } : {}),
      settings: { displayMode: "overlay", theme: "light", allowLogout: false },
    });
  });
}
