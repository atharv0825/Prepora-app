import * as Sentry from "@sentry/nextjs";
import {
  appEnvironment,
  sentryDataCollection,
  sentryTracesSampleRate,
} from "@prepora/shared/observability";

// Browser-side Sentry for the admin (M0-I2). Off unless NEXT_PUBLIC_SENTRY_DSN was set at build
// time (GitHub variable SENTRY_DSN_ADMIN). No PostHog in the admin: we don't track staff.

const environment = appEnvironment(window.location.hostname);
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn) && environment !== "development",
  environment,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: sentryTracesSampleRate,
  dataCollection: sentryDataCollection,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
