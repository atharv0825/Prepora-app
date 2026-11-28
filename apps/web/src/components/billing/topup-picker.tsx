"use client";

import { useState } from "react";
import { type Offer, formatMoney } from "@prepora/shared/api/billing";
import { BuyButton } from "./buy-button";
import "./topup.css";

/**
 * Top-ups (M9-F3). Several amounts (India: ₹100–₹500 in ₹50 steps) → a slider that snaps to each
 * one, with the credits it buys. One or two (Paddle countries) → plain cards. Each step is a
 * price row, so Buy is the usual checkout.
 */
export function TopupPicker({ topups, canBuy, email }: { topups: Offer[]; canBuy: boolean; email: string | null }) {
  const steps = [...topups].sort((a, b) => a.amount_minor - b.amount_minor);
  // Start in the middle of the range: a sensible default, and both directions are visible.
  const [index, setIndex] = useState(Math.floor((steps.length - 1) / 2));

  if (steps.length < 3) {
    return (
      <ul className="grid gap-3 sm:grid-cols-2" data-testid="topups">
        {steps.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4">
            <span>
              <span className="block font-medium tabular-nums">{t.credits} credits</span>
              <span className="text-sm text-muted-foreground tabular-nums">{formatMoney(t.amount_minor, t.currency)}</span>
            </span>
            {canBuy && <BuyButton priceId={t.id} label="Buy" email={email} variant="outline" testId={`buy-${t.id}`} />}
          </li>
        ))}
      </ul>
    );
  }

  const pick = steps[Math.min(index, steps.length - 1)]!;
  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  const fill = (index / (steps.length - 1)) * 100;

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border p-5" data-testid="topups">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p aria-live="polite">
          <span className="text-h2 tabular-nums" data-testid="topup-amount">
            {formatMoney(pick.amount_minor, pick.currency)}
          </span>
          <span className="ml-2 text-muted-foreground">
            for <strong className="font-semibold text-foreground tabular-nums" data-testid="topup-credits">{pick.credits}</strong> credits
          </span>
        </p>
        {canBuy && <BuyButton priceId={pick.id} label={`Buy ${pick.credits} credits`} email={email} testId="buy-topup" />}
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          step={1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Top-up amount"
          aria-valuetext={`${formatMoney(pick.amount_minor, pick.currency)} for ${pick.credits} credits`}
          className="tu-range"
          style={{ "--tu-fill": `${fill}%` } as React.CSSProperties}
          data-testid="topup-slider"
        />
        {/* One mark per step: the gaps the slider snaps to. */}
        <div className="flex justify-between px-[0.6rem]" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={i <= index ? "tu-tick tu-tick-on" : "tu-tick"} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums" aria-hidden>
          <span>{formatMoney(first.amount_minor, first.currency)}</span>
          <span>{formatMoney(last.amount_minor, last.currency)}</span>
        </div>
      </div>
    </div>
  );
}
