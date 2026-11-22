// Auth contract (M1-B1). Values the web and admin apps share with the Supabase Auth config.
// Prepora signs people in AND up with Google only; the email provider is disabled.

/** The only sign-in provider. Passed to supabase.auth.signInWithOAuth({ provider }). */
export const AUTH_PROVIDER = "google" as const;

/**
 * Where Supabase sends the browser back after Google OAuth (PKCE). Each app implements this
 * route (M1-F1 / M1-A1): it exchanges `?code=` for a session, then goes to `?next=`.
 * Every origin's `<origin>/**` must be in the project's redirect allowlist (docs/auth.md).
 */
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Default page after sign-in, per app. */
export const DEFAULT_NEXT_PATH = { web: "/app", admin: "/" } as const;

/**
 * Only same-site relative paths are allowed as `next`, so the callback can't be turned into an
 * open redirect (`//evil.com`, `/\evil.com`, `https://…`, `javascript:` …). Anything else → fallback.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  // Control characters (incl. tab/newline, which browsers strip) could hide a second slash.
  for (const ch of next) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f || ch === "\\") return fallback;
  }
  try {
    const url = new URL(next, "https://prepora.invalid");
    if (url.origin !== "https://prepora.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** `redirectTo` for signInWithOAuth: `<origin>/auth/callback?next=<safe path>`. */
export function authCallbackUrl(origin: string, next?: string | null, fallback = "/"): string {
  const url = new URL(AUTH_CALLBACK_PATH, origin);
  url.searchParams.set("next", safeNextPath(next, fallback));
  return url.toString();
}
