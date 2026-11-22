// Sign-in analytics hand-off (M1-F4). The callback route knows whether a Google sign-in created
// the account; PostHog only runs in the browser. So the callback leaves a short-lived,
// non-sensitive cookie ("signup" or "login") and the signed-in layout sends the event once.

export const AUTH_EVENT_COOKIE = "prepora_auth_event";
export const AUTH_EVENT_MAX_AGE = 120; // seconds: long enough to reach the first /app page

export type AuthEventKind = "signup" | "login";

/**
 * A first sign-in creates the user and signs them in at the same moment, so created_at and
 * last_sign_in_at are (almost) equal. Any later sign-in moves last_sign_in_at on.
 */
export function authEventKind(createdAt: string | undefined, lastSignInAt: string | undefined): AuthEventKind {
  if (!createdAt || !lastSignInAt) return "login";
  const gap = Math.abs(Date.parse(lastSignInAt) - Date.parse(createdAt));
  return Number.isFinite(gap) && gap < 60_000 ? "signup" : "login";
}

export function parseAuthEventKind(value: string | null | undefined): AuthEventKind | null {
  return value === "signup" || value === "login" ? value : null;
}
