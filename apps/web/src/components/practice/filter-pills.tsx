import Link from "next/link";
import { cn } from "cn";

// Academic / General Training / All: flat pills in brand-rust (the palette's brown). The chosen one
// is filled brown with white text (7.2 : 1); the others are white with brown text and outline.

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
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <Link
          key={f.value}
          href={hrefFor(f.value)}
          aria-current={current === f.value ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-rust",
            current === f.value
              ? "bg-brand-rust text-white"
              : "bg-card text-brand-rust ring-1 ring-brand-rust/30 hover:bg-[#f7efee] dark:text-[#f2c4c4] dark:ring-white/15 dark:hover:bg-white/5",
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}
