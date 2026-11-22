import Image from "next/image";
import Link from "next/link";
import { cn } from "@prepora/ui/lib/utils";

/** Green "P" app icon (public/logo.png) + "Prepora" wordmark in the logo green (design doc §1). */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Prepora home"
      className={cn("inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40", className)}
    >
      <Image src="/logo.png" alt="" width={32} height={32} className="size-8" priority />
      <span className="font-heading text-lg font-semibold tracking-tight text-brand-logo">Prepora</span>
    </Link>
  );
}
