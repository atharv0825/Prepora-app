import Image from "next/image";
import Link from "next/link";
import { cn } from "@prepora/ui/lib/utils";

/** Same logo as the student app, plus an "Admin" tag. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      aria-label="Prepora Admin home"
      className={cn("inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/40", className)}
    >
      <Image src="/logo.png" alt="" width={32} height={32} className="size-8" priority />
      <span className="font-heading text-lg font-semibold tracking-tight text-brand-logo">Prepora</span>
      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Admin
      </span>
    </Link>
  );
}
