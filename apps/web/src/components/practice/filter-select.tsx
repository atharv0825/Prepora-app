"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

// Academic / General Training / All as a dropdown in the practice header (between the title and
// the completion bar). It starts on the test type chosen at onboarding (the page's default
// filter). Styled like the nav bar's dark pill at low opacity; the colours are inline so stale CSS
// can't hide them.

export function FilterSelect<V extends string>({
  filters,
  current,
  hrefs,
  label = "Test type",
}: {
  filters: readonly { value: V; label: string }[];
  current: V;
  /** Where each option goes (computed on the server: functions can't be passed to the client). */
  hrefs: Record<V, string>;
  label?: string;
}) {
  const router = useRouter();
  return (
    <div className="relative self-start sm:self-auto">
      <select
        aria-label={label}
        value={current}
        onChange={(e) => router.push(hrefs[e.target.value as V])}
        className="h-10 cursor-pointer rounded-full text-sm font-medium text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          paddingLeft: "1rem",
          paddingRight: "2.25rem",
          backgroundColor: "color-mix(in srgb, var(--foreground) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
        }}
      >
        {filters.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-foreground/70" />
    </div>
  );
}
