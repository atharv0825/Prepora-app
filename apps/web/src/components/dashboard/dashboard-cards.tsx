import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ModuleStats } from "@prepora/shared/api/dashboard";
import { cn } from "@prepora/ui/lib/utils";
import type { DashboardModule, ModuleKey } from "@/lib/dashboard";
import { formatBand } from "@/lib/onboarding";
import { MODULE_STYLE } from "./module-style";

// Home dashboard module tiles (M2-F3; restyled in M8.6 to match the overview cards): white cards
// on the same soft panel, the module's chart colour on its icon, a round ↗ button, and a footer
// that is the same on every tile (practice count and latest band), so titles line up. The
// recommended module gets a green pill and ring instead of a different background.
// Server components: no client JS.

export function ModuleGrid({
  modules,
  recommended,
  stats,
}: {
  modules: readonly DashboardModule[];
  recommended: ModuleKey | null;
  /** Per-module practice from get_my_dashboard; null when it couldn't be loaded. */
  stats: readonly ModuleStats[] | null;
}) {
  return (
    <section aria-labelledby="modules-heading" className="flex flex-col gap-4">
      <h2 id="modules-heading" className="text-h3">
        Practise
      </h2>
      <ul className="grid gap-3 rounded-[2rem] bg-muted p-3 sm:grid-cols-2 sm:gap-4 sm:p-4 xl:grid-cols-4">
        {modules.map((m) => (
          <li key={m.key}>
            <ModuleTile module={m} recommended={m.key === recommended} stats={stats?.find((s) => s.module === m.key) ?? null} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ModuleTile({ module: m, recommended, stats }: { module: DashboardModule; recommended: boolean; stats: ModuleStats | null }) {
  const style = MODULE_STYLE[m.key];
  const Icon = style.icon;
  const available = m.status === "available" && m.href;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-12 shrink-0 place-items-center rounded-full ring-4", style.bg, style.onBg, style.ring)}>
          <Icon className="size-5" aria-hidden />
        </span>
        {available ? (
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-full bg-muted transition-colors group-hover:bg-foreground group-hover:text-background"
          >
            <ArrowUpRight className="size-4" />
          </span>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">Coming soon</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium">{m.title}</h3>
        <p className="text-sm text-muted-foreground">{m.description}</p>
      </div>
      {/* min-h fits the "Recommended next" pill, so every footer is the same height. */}
      <div className="mt-auto flex min-h-11 flex-wrap items-end justify-between gap-2 border-t border-border pt-4 text-xs">
        <p className="text-muted-foreground" data-testid="module-progress">
          {!stats ? (
            " "
          ) : stats.count === 0 ? (
            "Not started yet"
          ) : (
            <>
              <span className="font-medium text-foreground tabular-nums">{stats.count}</span> {stats.count === 1 ? "practice" : "practices"}
              {stats.latest_band !== null && (
                <>
                  {" · "}Latest <span className="font-medium text-foreground tabular-nums">{formatBand(stats.latest_band)}</span>
                </>
              )}
            </>
          )}
        </p>
        {recommended && <span className="rounded-full bg-primary px-2.5 py-1 font-medium text-primary-foreground">Recommended next</span>}
      </div>
    </>
  );

  const tileClass = cn(
    "group flex h-full flex-col gap-5 rounded-3xl bg-card p-5 text-card-foreground shadow-xs transition-shadow sm:p-6",
    recommended && "ring-2 ring-primary",
  );

  if (available) {
    return (
      <Link
        href={m.href!}
        className={cn(tileClass, "hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
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
