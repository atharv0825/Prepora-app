import posthog from "posthog-js";
import type { AnalyticsEvent, AnalyticsEvents, AnalyticsPerson } from "@prepora/shared/analytics";

// Typed PostHog wrapper (M0-I2). Only events from packages/shared/src/analytics.ts compile.
// Safe to call anywhere on the client: a no-op when PostHog wasn't initialised (no key, local dev).

function ready(): boolean {
  return typeof window !== "undefined" && posthog.__loaded;
}

export function track<E extends AnalyticsEvent>(event: E, properties: AnalyticsEvents[E]): void {
  if (ready()) posthog.capture(event, properties);
}

/** After login (M1-F4). Pass our user id only, never an email. */
export function identify(userId: string, person: AnalyticsPerson): void {
  if (ready()) posthog.identify(userId, person);
}

/** On logout, so the next person on this device isn't merged with the last one. */
export function resetAnalytics(): void {
  if (ready()) posthog.reset();
}
