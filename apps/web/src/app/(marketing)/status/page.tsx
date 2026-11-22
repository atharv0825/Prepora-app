import type { Metadata } from "next";
import { Badge } from "@prepora/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@prepora/ui/components/card";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { getHealth } from "@/lib/supabase/functions";
import { createClient } from "@/lib/supabase/server";

// M0 exit criterion: the web app calls the `health` Edge Function (pinned to Singapore).
export const metadata: Metadata = { title: "Status · Prepora", robots: { index: false } };
export const dynamic = "force-dynamic"; // check on every request, never prerender

async function checkBackend() {
  try {
    const supabase = await createClient();
    const started = Date.now();
    const result = await getHealth(supabase);
    return { ...result, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof SupabaseConfigError) {
      return { data: null, error: { code: "not_configured", message: err.message }, latencyMs: 0 };
    }
    throw err;
  }
}

export default async function StatusPage() {
  const { data, error, latencyMs } = await checkBackend();
  const rows = data
    ? [
        ["Environment", data.env],
        ["Function version", data.version],
        ["Ran in region", data.region],
        ["Pinned region", data.pinnedRegion],
        ["Latency", `${latencyMs} ms`],
        ["Checked at", new Date(data.time).toUTCString()],
      ]
    : [];

  return (
    <section className="container-page pt-28 pb-12 sm:pt-36 sm:pb-20">
      <h1 className="text-h1">System status</h1>
      <Card className="mt-8 max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            Backend (Edge Functions)
            <Badge variant={data ? "default" : "destructive"}>
              {data ? "Operational" : "Unavailable"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{error?.code}</span>: {error?.message}
            </p>
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-xs text-muted-foreground">
        Web v{process.env.NEXT_PUBLIC_APP_VERSION} · {process.env.NEXT_PUBLIC_COMMIT_SHA}
      </p>
    </section>
  );
}
