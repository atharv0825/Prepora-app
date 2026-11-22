// Admin access rules (M1-A1). Pure and Edge-safe: used by src/middleware.ts and the layout.
import type { Role } from "@prepora/shared/types/profile";
import { DEFAULT_NEXT_PATH, safeNextPath } from "@prepora/shared/constants/auth";
import { isStaff } from "@prepora/shared/types/profile";

export const adminRoutes = {
  login: "/login",
  callback: "/auth/callback",
  forbidden: "/forbidden",
  home: "/dashboard",
} as const;

/** Reachable without a staff session: the sign-in flow and the "no access" page. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === adminRoutes.login ||
    pathname === adminRoutes.callback ||
    pathname === adminRoutes.forbidden
  );
}

export function adminNext(next: string | null | undefined): string {
  const safe = safeNextPath(next, DEFAULT_NEXT_PATH.admin);
  return safe === "/" ? adminRoutes.home : safe;
}

export type Viewer = { signedIn: false } | { signedIn: true; role: Role | null };

export type AccessDecision = { action: "continue" } | { action: "redirect"; to: string };

/**
 * Only `admin` and `content_editor` get in (fail closed: unknown role / no profile row = no).
 *  - signed out, private page        → /login?next=<path>
 *  - signed in, not staff            → /forbidden (also from /login)
 *  - staff on /login or /forbidden   → their next, else /dashboard
 */
export function accessDecision(url: { pathname: string; search: string }, viewer: Viewer): AccessDecision {
  const { pathname } = url;
  if (pathname === adminRoutes.callback) return { action: "continue" };

  if (!viewer.signedIn) {
    if (isPublicPath(pathname)) {
      return pathname === adminRoutes.forbidden ? { action: "redirect", to: adminRoutes.login } : { action: "continue" };
    }
    const target = pathname + url.search;
    const q = target === "/" || target === adminRoutes.home ? "" : `?next=${encodeURIComponent(target)}`;
    return { action: "redirect", to: `${adminRoutes.login}${q}` };
  }

  if (!isStaff(viewer.role)) {
    return pathname === adminRoutes.forbidden ? { action: "continue" } : { action: "redirect", to: adminRoutes.forbidden };
  }

  if (pathname === adminRoutes.login || pathname === adminRoutes.forbidden) {
    const next = new URLSearchParams(url.search).get("next");
    return { action: "redirect", to: adminNext(next) };
  }
  return { action: "continue" };
}
