"use client";

import Link from "next/link";
import { cn } from "@prepora/ui/lib/utils";
import { useNavActive } from "@/hooks/use-nav-active";
import { mainNav } from "@/lib/routes";

/** Desktop nav: muted links; the active one (current page or section in view) is full colour
 *  with a green pill behind it and a short green underline (design doc §1). */
export function NavLinks() {
  const isActive = useNavActive();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:gap-2 md:flex">
      {mainNav.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-sm transition-colors outline-none hover:bg-brand-foam hover:text-foreground focus-visible:text-foreground",
              active
                ? "bg-brand-foam font-medium text-foreground after:absolute after:bottom-0 after:left-1/2 after:h-0.5 after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-brand-primary"
                : "text-foreground/75",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
