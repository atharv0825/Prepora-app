import type { ReactNode } from "react";
import { cn } from "cn";

/**
 * One of two choices of how to take something (Exam mode / Practice mode): a radio card with an
 * icon, a title and what it means, in the section's colour. Put two in a role="radiogroup".
 */
export function ModeOption({ selected, onSelect, icon, title, body, testId }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; body: string; testId: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      data-testid={testId}
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected ? "border-primary bg-primary/10" : "border-foreground/15 hover:border-primary",
      )}
    >
      <span className="flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </span>
      <span className="text-sm text-muted-foreground">{body}</span>
    </button>
  );
}
