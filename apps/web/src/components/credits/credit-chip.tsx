"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";
import { useCredits } from "./credits-provider";

/** M3-F1: the balance in the signed-in header; links to "Credits & usage". */
export function CreditChip() {
  const { credits } = useCredits();
  const empty = credits !== null && credits.balance === 0;
  return (
    <Link
      href={routes.credits}
      aria-label={credits ? `${credits.balance} credits. Credits and usage` : "Credits and usage"}
      className={cn(
        "flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40",
        empty
          ? "border-destructive/40 text-destructive hover:bg-destructive/5"
          : "border-brand-line bg-secondary text-secondary-foreground hover:bg-secondary/70",
      )}
    >
      <Coins className="size-4" aria-hidden />
      {credits ? credits.balance : <span>Credits</span>}
    </Link>
  );
}
