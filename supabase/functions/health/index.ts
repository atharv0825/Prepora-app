// GET/POST /functions/v1/health
// Liveness check used by the web app (M0 exit criterion) and uptime monitoring.
// Public (no session needed); if a valid session is sent, `authenticated` is true.
//
// Example:
//   curl "$SUPABASE_URL/functions/v1/health?echo=hi" -H "x-region: ap-southeast-1"

import { z } from "../_shared/deps.ts";
import { createHandler } from "../_shared/handler.ts";
import { currentRegion, PINNED_REGION } from "../_shared/region.ts";

const HealthInput = z.object({
  echo: z.string().max(100).optional(),
});

export type HealthResponse = {
  status: "ok";
  version: string;
  env: string;
  region: string;
  pinnedRegion: string;
  inPinnedRegion: boolean;
  authenticated: boolean;
  time: string;
  echo?: string;
};

Deno.serve(
  createHandler(
    { name: "health", methods: ["GET", "POST"], auth: "optional", input: HealthInput },
    async ({ input, user }): Promise<HealthResponse> => {
      const region = currentRegion();
      return {
        status: "ok",
        version: Deno.env.get("APP_VERSION") ?? "dev",
        env: Deno.env.get("APP_ENV") ?? "local",
        region,
        pinnedRegion: PINNED_REGION,
        inPinnedRegion: region === "local" || region === PINNED_REGION,
        authenticated: user !== null,
        time: new Date().toISOString(),
        ...(input.echo !== undefined && { echo: input.echo }),
      };
    },
  ),
);
