"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@prepora/ui/lib/utils";
import { isActive, navGroups } from "@/lib/nav";

/** Grouped module links. Active: white pill on the mint sidebar with a green left bar. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {navGroups.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map(({ slug, label, icon: Icon }) => {
              const active = isActive(pathname, slug);
              return (
                <li key={slug}>
                  <Link
                    href={`/${slug}`}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-card font-medium text-foreground shadow-[0_1px_2px_rgba(8,34,43,0.06)] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary"
                        : "text-foreground/75 hover:bg-card/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
