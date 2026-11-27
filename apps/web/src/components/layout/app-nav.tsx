"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@prepora/ui/lib/utils";
import { routes } from "@/lib/routes";

// Signed-in header navigation (M8.6): pill links, the current section in a dark pill. Wide
// screens only; on phones the dashboard's module tiles and the account menu cover the same.

const items = [
  { label: "Dashboard", href: routes.app, exact: true },
  { label: "Reading", href: routes.reading },
  { label: "Listening", href: routes.listening },
  { label: "Writing", href: routes.writing },
  { label: "Speaking", href: routes.speaking },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden lg:block">
      <ul className="flex items-center gap-1.5 rounded-full bg-muted p-1">
        {items.map((item) => {
          const active = "exact" in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active ? "bg-foreground font-medium text-background" : "text-foreground/75 hover:bg-card hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
