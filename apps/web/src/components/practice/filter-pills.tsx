import Link from "next/link";
import { cn } from "cn";

// Academic / General Training / All: 3D pills in brand-rust (the palette's brown). The chosen one
// is filled brown with white text (7.2 : 1); the others are white with brown text.

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
            "rounded-full px-4 py-2 text-sm font-medium transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-rust",
            current === f.value
              ? "bg-gradient-to-b from-[#a65453] to-brand-rust text-white ring-1 ring-black/10 shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-2px_0_rgb(0_0_0/0.12),0_8px_16px_-8px_rgb(140_63_63/0.8)]"
              : "bg-gradient-to-b from-white to-[#f7efee] text-brand-rust ring-1 ring-brand-rust/25 shadow-[inset_0_1px_0_white,inset_0_-2px_0_rgb(140_63_63/0.08),0_6px_12px_-8px_rgb(140_63_63/0.55)] dark:from-[#164c58] dark:to-[#0f3b47] dark:text-[#f2c4c4] dark:ring-white/10",
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}
