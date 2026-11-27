"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@prepora/ui/components/dropdown-menu";

// Prepora's dropdown (used instead of a native <select>): a pill trigger styled like the nav bar's
// pill at low opacity, and a menu of options with a check on the chosen one. Keyboard and screen
// reader behaviour come from the Base UI menu. The trigger's look is inline (no new classes), and
// its label and chevron sit side by side, so nothing can overlap.
//
// Each option either navigates (`hrefs`) or calls `onChange`.

export type DropdownOption<V extends string> = { value: V; label: string };

export function Dropdown<V extends string>({
  label,
  options,
  value,
  hrefs,
  onChange,
}: {
  /** What it chooses, for screen readers ("Test type"). */
  label: string;
  options: readonly DropdownOption<V>[];
  value: V;
  /** Where each option goes (computed on the server: functions can't be passed to the client). */
  hrefs?: Partial<Record<V, string>>;
  onChange?: (value: V) => void;
}) {
  const router = useRouter();
  const current = options.find((o) => o.value === value)?.label ?? value;

  function choose(next: V) {
    if (next === value) return;
    onChange?.(next);
    const href = hrefs?.[next];
    if (href) router.push(href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${label}: ${current}`}
        className="cursor-pointer text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          height: "2.5rem",
          padding: "0 0.875rem 0 1rem",
          borderRadius: "9999px",
          backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
          border: "1px solid color-mix(in srgb, var(--foreground) 12%, transparent)",
          whiteSpace: "nowrap",
        }}
        data-testid="dropdown-trigger"
      >
        <span>{current}</span>
        <ChevronDown aria-hidden style={{ width: "1rem", height: "1rem", opacity: 0.7, flexShrink: 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-44">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => choose(v as V)}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} closeOnClick>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
