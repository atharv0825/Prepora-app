// Which routes need a session (M1-F2). Pure and Edge-safe: used by src/middleware.ts.
import { routes } from "./routes";

/** Signed-in area: /app and everything below it. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === routes.app || pathname.startsWith(`${routes.app}/`);
}

/** Pages a signed-in person shouldn't see (they're sent on to the app). */
export function isAuthPage(pathname: string): boolean {
  return pathname === routes.login || pathname === routes.signup;
}

export type RouteDecision = { action: "continue" } | { action: "redirect"; to: string };

/**
 * - Signed out on /app/* → /login?next=<where they were going> (path + query).
 * - Signed in on /login or /signup → their `next`, else /app. `next` was already validated by
 *   the caller (safeNextPath), so it's always a same-site path.
 * - Everything else continues.
 */
export function routeDecision(
  url: { pathname: string; search: string },
  signedIn: boolean,
  safeNext: string,
): RouteDecision {
  if (!signedIn && isProtectedPath(url.pathname)) {
    const target = url.pathname + url.search;
    const q = target === routes.app ? "" : `?next=${encodeURIComponent(target)}`;
    return { action: "redirect", to: `${routes.login}${q}` };
  }
  if (signedIn && isAuthPage(url.pathname)) {
    return { action: "redirect", to: safeNext };
  }
  return { action: "continue" };
}
