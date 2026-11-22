"use client";

import { useEffect } from "react";
import { AUTH_PROVIDER } from "@prepora/shared/constants/auth";
import type { AnalyticsPerson } from "@prepora/shared/analytics";
import { AUTH_EVENT_COOKIE, parseAuthEventKind } from "@/lib/analytics/auth-event";
import { identifyUser, track } from "@/lib/analytics";

function takeCookie(name: string): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
  return decodeURIComponent(match.slice(name.length + 1));
}

/**
 * Renders nothing. In the signed-in layout (M1-F4):
 *  1. identifies the user in PostHog and Sentry (id + person properties, no PII);
 *  2. after a fresh Google sign-in, sends signup_completed or login_completed once
 *     (the callback route left a 2-minute cookie saying which).
 */
export function UserAnalytics({ userId, person }: { userId: string; person: AnalyticsPerson }) {
  const { plan, country_code, test_type, target_band, exam_date } = person;

  useEffect(() => {
    identifyUser(userId, { plan, country_code, test_type, target_band, exam_date });

    const kind = parseAuthEventKind(takeCookie(AUTH_EVENT_COOKIE));
    if (kind === "signup") track("signup_completed", { method: AUTH_PROVIDER, country: country_code });
    if (kind === "login") track("login_completed", { method: AUTH_PROVIDER });
  }, [userId, plan, country_code, test_type, target_band, exam_date]);

  return null;
}
