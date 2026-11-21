"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@prepora/ui/lib/utils";
import { isActive, mainNav } from "@/lib/routes";

/** Desktop nav: grey links; the active one is white with a short 2px underline (design doc §1). */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
      {mainNav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative py-2 text-sm transition-colors outline-none hover:text-foreground focus-visible:text-foreground",
              active
                ? "text-foreground after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-4 after:rounded-full after:bg-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
