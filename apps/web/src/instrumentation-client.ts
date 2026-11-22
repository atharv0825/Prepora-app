import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import {
  appEnvironment,
  sentryDataCollection,
  sentryTracesSampleRate,
} from "@prepora/shared/observability";

// Browser-side Sentry and PostHog (M0-I2). Runs once, before the app becomes interactive.
// Both stay off unless their public keys were set at build time (GitHub variables
// SENTRY_DSN_WEB / POSTHOG_KEY, or .env.local), so local dev and forks send nothing.

const environment = appEnvironment(window.location.hostname);
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: sentryDsn || undefined,
  enabled: Boolean(sentryDsn) && environment !== "development",
  environment,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  tracesSampleRate: sentryTracesSampleRate,
  dataCollection: sentryDataCollection,
});

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
if (posthogKey && environment !== "development") {
  posthog.init(posthogKey, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    // Connected only: nothing is captured automatically. Events from
    // packages/shared/src/analytics.ts are sent explicitly via @/lib/analytics, one milestone at a time.
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false, // Sentry handles errors
    disable_session_recording: true, // only after every text input is masked (plan §7)
    person_profiles: "identified_only",
    // No cookies or localStorage until the cookie notice exists (plan §7).
    persistence: "memory",
  });
  posthog.register({ environment, app_version: process.env.NEXT_PUBLIC_APP_VERSION });
}

// Records client-side navigations as breadcrumbs.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
