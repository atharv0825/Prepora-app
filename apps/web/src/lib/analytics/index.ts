import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";
import type { AnalyticsEvent, AnalyticsEvents, AnalyticsPerson } from "@prepora/shared/analytics";

// Typed PostHog wrapper (M0-I2) + user identity for PostHog and Sentry (M1-F4).
// Only events from packages/shared/src/analytics.ts compile. Safe to call anywhere on the client:
// a no-op when PostHog / Sentry weren't initialised (no key, local dev).

function ready(): boolean {
  return typeof window !== "undefined" && posthog.__loaded;
}

export function track<E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]): void {
  if (ready()) posthog.capture(event, properties);
}

/**
 * Attach this browser's analytics and errors to the signed-in user. Our user id (a UUID) only:
 * never the email or name. PostHog: identify once per user (a repeat would send another
 * $identify event); person properties are updated each time.
 */
export function identifyUser(userId: string, person: AnalyticsPerson): void {
  Sentry.setUser({ id: userId });
  if (!ready()) return;
  if (posthog.get_distinct_id() === userId) posthog.setPersonProperties(person);
  else posthog.identify(userId, person);
}

/** On logout, so the next person on this device isn't merged with the last one. */
export function resetUser(): void {
  Sentry.setUser(null);
  if (ready()) posthog.reset();
}
