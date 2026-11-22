// Auth contract (M1-B1). Values the web and admin apps share with the Supabase Auth config.

/** Email sign-in uses a 6-digit code. Must match supabase/config.toml [auth.email] otp_length. */
export const OTP_LENGTH = 6;
/** Code lifetime. Must match [auth.email] otp_expiry (and the hosted Email provider setting). */
export const OTP_EXPIRY_SECONDS = 600;
/** Minimum wait before "resend code". Matches [auth.email] max_frequency. */
export const OTP_RESEND_SECONDS = 60;

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

/** A 6-digit code as typed by a person: strips spaces/dashes, then checks the length. */
export function normaliseOtp(input: string): string | null {
  const digits = input.replace(/[\s-]/g, "");
  return digits.length === OTP_LENGTH && /^\d+$/.test(digits) ? digits : null;
}
