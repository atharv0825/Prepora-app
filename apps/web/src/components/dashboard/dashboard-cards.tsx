import Link from "next/link";
import { ArrowRight, BookOpen, Headphones, Mic, PenLine, type LucideIcon } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { cn } from "@prepora/ui/lib/utils";
import type { DashboardModule, ModuleKey } from "@/lib/dashboard";

// Home dashboard module tiles (M2-F3, UI design: 2×2 module tiles with the recommended one in
// green). The goal, credits and streak cards and the charts are in overview.tsx (M8.6).
// Server components: no client JS.

const moduleIcons: Record<ModuleKey, LucideIcon> = {
  reading: BookOpen,
  listening: Headphones,
  writing: PenLine,
  speaking: Mic,
};

export function ModuleGrid({
  modules,
  recommended,
}: {
  modules: readonly DashboardModule[];
  recommended: ModuleKey | null;
}) {
  return (
    <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
      <h2 id="modules-heading" className="text-h3">
        Practise
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4">
        {modules.map((m) => (
          <li key={m.key}>
            <ModuleTile module={m} recommended={m.key === recommended} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModuleTile({ module: m, recommended }: { module: DashboardModule; recommended: boolean }) {
  const Icon = moduleIcons[m.key];
  const available = m.status === "available" && m.href;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-full",
            recommended ? "bg-white/25" : "bg-background text-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
        {available ? (
          <ArrowRight className="size-5" aria-hidden />
        ) : (
          <Badge variant="outline" className="bg-background/60">
            Coming soon
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium">{m.title}</h3>
        <p className={cn("text-sm", recommended ? "text-primary-foreground/80" : "text-muted-foreground")}>
          {m.description}
        </p>
        {recommended && <p className="mt-1 text-xs font-medium">Recommended next</p>}
      </div>
    </>
  );
  const tileClass = cn(
    "flex h-full min-h-40 flex-col justify-between gap-6 rounded-3xl p-5 transition-colors",
    recommended ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
  );

  if (available) {
    return (
      <Link href={m.href!} className={cn(tileClass, "hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/40")}>
        {body}
      </Link>
    );
  }
  return (
    <div className={tileClass} aria-disabled="true">
      {body}
    </div>
  );
}
