import { Sentry } from "./deps.ts";
import { currentRegion } from "./region.ts";

// Sentry is optional: without the SENTRY_DSN secret everything is a no-op (local dev, or
// before M0-I2 creates the Sentry project).

const dsn = Deno.env.get("SENTRY_DSN");
let initialised = false;

function init() {
  if (initialised || !dsn) return;
  Sentry.init({
    dsn,
    // The edge runtime lacks some APIs the default integrations need.
    defaultIntegrations: false,
    environment: Deno.env.get("APP_ENV") ?? "local",
    release: Deno.env.get("APP_VERSION"),
    tracesSampleRate: 0,
  });
  Sentry.setTag("region", currentRegion());
  initialised = true;
}

export async function captureException(
  err: unknown,
  context: { fn: string; requestId: string; userId?: string },
): Promise<void> {
  if (!dsn) return;
  init();
  Sentry.withScope((scope) => {
    scope.setTag("function", context.fn);
    scope.setTag("request_id", context.requestId);
    scope.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "local");
    if (context.userId) scope.setUser({ id: context.userId });
    Sentry.captureException(err);
  });
  // The worker can be shut down right after the response; flush first.
  await Sentry.flush(2000);
}
