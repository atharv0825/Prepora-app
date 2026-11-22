import { CheckCircle2 } from "lucide-react";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@prepora/ui/components/card";
import type { AdminModule } from "@/lib/nav";

/** Header + "what this module will do" card for a module that isn't built yet. */
export function ModuleIntro({ module: m }: { module: AdminModule }) {
  const Icon = m.icon;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="mint grid size-12 place-items-center rounded-2xl border border-border bg-background">
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h1 className="text-h2">{m.label}</h1>
            <p className="mt-1 text-muted-foreground">{m.summary}</p>
          </div>
        </div>
        <Badge variant="outline">Arrives in {m.milestone}</Badge>
      </div>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>What you&apos;ll do here</CardTitle>
          <CardDescription>Planned in Prepora_Implementation_Plan.md §6.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2.5 text-sm">
            {m.features.map((f) => (
              <li key={f} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-sea" strokeWidth={1.5} aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
