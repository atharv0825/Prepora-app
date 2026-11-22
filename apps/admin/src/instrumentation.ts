import type { Instrumentation } from "next";
import { captureException } from "@sentry/core";

// Server errors → Sentry (M0-I2). Errors from Server Components, route handlers and server actions.
//
// Deliberately @sentry/core, not @sentry/nextjs: on Cloudflare the Sentry client is created by
// withSentry in worker.mjs, and @sentry/core finds it through Sentry's global carrier (same SDK
// version). Importing @sentry/nextjs here would bundle its Node.js SDK + OpenTelemetry (~1.4 MB
// per copy) into the Worker for nothing. Under `next dev` / `next start` there is no client, so this
// is a no-op locally.
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  captureException(error, {
    tags: {
      router: context.routerKind,
      route_type: context.routeType,
      render_source: context.renderSource ?? "unknown",
    },
    contexts: {
      next_request: { path: request.path, method: request.method, route: context.routePath },
    },
  });
};
