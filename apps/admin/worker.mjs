// Cloudflare Worker entry (M0-I2): the OpenNext worker, wrapped by Sentry so server errors are
// reported. wrangler.jsonc "main" points here; OpenNext builds .open-next/worker.js first.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/cloudflare/
//
// The DSN comes from the Worker variable SENTRY_DSN (passed with --var at deploy from the GitHub
// variable SENTRY_DSN_ADMIN). Without it Sentry stays off and the app works the same.
import * as Sentry from "@sentry/nextjs/cloudflare";
import handler from "./.open-next/worker.js";

// OpenNext's Durable Objects must stay exported from the entry (unused today, harmless).
export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

export default Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN || undefined,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.APP_ENV ?? "staging",
    release: env.SENTRY_RELEASE || undefined, // passed with --var by CI, same as the browser release
    // Same settings as packages/shared/src/observability.ts (this file isn't compiled by Next,
    // so it doesn't import TypeScript source).
    tracesSampleRate: 0,
    dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
  }),
  handler,
);
