// Auth helpers shared by the login/sign-up pages and the /auth/callback route (M1-F1).
// Pure functions only, so they're unit-tested without Supabase.
import { DEFAULT_NEXT_PATH, safeNextPath } from "@prepora/shared/constants/auth";

/** Error codes the callback puts in `/login?error=…`. */
export type AuthErrorCode = "cancelled" | "callback" | "config";

const messages: Record<AuthErrorCode, string> = {
  cancelled: "Google sign-in was cancelled. Try again when you're ready.",
  callback: "We couldn't finish signing you in. Please try again.",
  config: "Sign-in isn't available right now. Please try again later.",
};

export function authErrorMessage(code: string | null | undefined): string | null {
  return code && Object.hasOwn(messages, code) ? messages[code as AuthErrorCode] : null;
}

/** Where to go after sign-in: a safe same-site `next`, else the app home. */
export function nextPath(next: string | string[] | null | undefined): string {
  return safeNextPath(Array.isArray(next) ? next[0] : next, DEFAULT_NEXT_PATH.web);
}

export type CallbackStep =
  | { kind: "exchange"; code: string; next: string }
  | { kind: "error"; error: AuthErrorCode };

/**
 * What the callback should do with the query Supabase sent back:
 * `?code=` → exchange it; `?error=access_denied` (user closed Google's screen) → "cancelled";
 * anything else → generic callback error.
 */
export function callbackStep(params: URLSearchParams): CallbackStep {
  const error = params.get("error");
  if (error) return { kind: "error", error: error === "access_denied" ? "cancelled" : "callback" };
  const code = params.get("code");
  if (!code) return { kind: "error", error: "callback" };
  return { kind: "exchange", code, next: nextPath(params.get("next")) };
}

/** `/login?error=…&next=…`, keeping where the person was going. */
export function loginUrlWithError(error: AuthErrorCode, next?: string | null): string {
  const q = new URLSearchParams({ error });
  const safe = next ? nextPath(next) : null;
  if (safe && safe !== DEFAULT_NEXT_PATH.web) q.set("next", safe);
  return `/login?${q}`;
}
