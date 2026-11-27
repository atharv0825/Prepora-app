import Link from "next/link";
import { cn } from "cn";

// Academic / General Training / All: styled like the top navigation's pills (the same classes):
// a soft track, the chosen one dark with light text, the others muted until hovered.

export function FilterPills<V extends string>({
  filters,
  current,
  hrefFor,
  label = "Test type",
}: {
  filters: readonly { value: V; label: string }[];
  current: V;
  hrefFor: (value: V) => string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="self-start">
      <ul className="flex flex-wrap items-center gap-1.5 rounded-full bg-muted p-1">
        {filters.map((f) => (
          <li key={f.value}>
            <Link
              href={hrefFor(f.value)}
              aria-current={current === f.value ? "page" : undefined}
              className={cn(
                "block rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                current === f.value ? "bg-foreground font-medium text-background" : "text-foreground/75 hover:bg-card hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
