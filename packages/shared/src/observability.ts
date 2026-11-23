// Shared Sentry/PostHog settings for the web and admin apps (M0-I2).
// No SDK imports here: the apps pass these values to their own SDK calls.

export type AppEnvironment = "development" | "preview" | "staging" | "production";

/**
 * Environment from the hostname the page is served on. One build is uploaded both as a PR preview
 * and deployed to staging, so this can't be baked in at build time.
 */
export function appEnvironment(hostname: string): AppEnvironment {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost")) {
    return "development";
  }
  if (host.endsWith(".workers.dev")) return "preview";
  if (host.startsWith("staging.") || host.startsWith("admin-staging.")) return "staging";
  return "production";
}

/** Release name shared by the browser and server SDKs, e.g. "prepora-web@0.1.0+2654abf". */
export function releaseName(app: "web" | "admin", version: string, sha: string): string {
  return `prepora-${app}@${version}+${sha}`;
}

/**
 * Privacy defaults for every Sentry client. We attach the user ourselves after login (M1-F4,
 * id only); nothing else about the person is collected automatically.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpBodies: [] as never[],
  urlQueryParams: false,
} as const;

/** Errors only for now: no performance tracing until we decide on a budget (M12-B2). */
export const sentryTracesSampleRate = 0;
