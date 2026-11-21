import Link from "next/link";
import { cn } from "@prepora/ui/lib/utils";

/** Monogram "P" in a white square + "Prepora" wordmark (design doc §1). Uses tokens, so it
 *  works on dark (white square) and light (black square). */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Prepora home"
      className={cn("inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40", className)}
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-[7px] bg-foreground font-heading text-lg font-semibold text-background"
      >
        P
      </span>
      <span className="font-heading text-lg font-medium tracking-tight">Prepora</span>
    </Link>
  );
}
