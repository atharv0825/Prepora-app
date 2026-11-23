import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_EVENT_COOKIE,
  AUTH_EVENT_MAX_AGE,
  authEventKind,
  type AuthEventKind,
} from "@/lib/analytics/auth-event";
import { callbackStep, loginUrlWithError } from "@/lib/auth";
import { recordSignupCountry, requestCountry } from "@/lib/signup-country";
import { createClient } from "@/lib/supabase/server";

// Google OAuth return URL (M1-F1, docs/auth.md). Supabase redirects here with ?code= (PKCE).
// Exchanging it sets the session cookies on this response; then we go to the safe `next`.
// Must be in each Supabase project's redirect allowlist as <origin>/**.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const step = callbackStep(searchParams);
  const go = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (step.kind === "error") {
    return go(loginUrlWithError(step.error, searchParams.get("next")));
  }

  let kind: AuthEventKind;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(step.code);
    if (error) {
      // Expired/used code, or the PKCE verifier cookie is missing (different browser/device).
      console.warn("auth callback: code exchange failed", error.code ?? error.message);
      return go(loginUrlWithError("callback", step.next));
    }
    kind = authEventKind(data.user?.created_at, data.user?.last_sign_in_at);
    await saveSignupCountry(supabase, data.user.id, request);
  } catch (err) {
    console.error("auth callback failed", err);
    return go(loginUrlWithError("config", step.next));
  }

  // M1-F4: tell the browser which analytics event to send (signup_completed / login_completed).
  // Readable by JS on purpose; it holds only "signup" or "login".
  const response = go(step.next);
  response.cookies.set(AUTH_EVENT_COOKIE, kind, {
    path: "/",
    maxAge: AUTH_EVENT_MAX_AGE,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    httpOnly: false,
  });
  return response;
}

// M2-B3: store the sign-up country before redirecting, so the first page (and the
// signup_completed event, which reads profiles.country_code) already has it. Never blocks sign-in.
async function saveSignupCountry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  request: NextRequest,
) {
  try {
    await recordSignupCountry(supabase, userId, requestCountry(request.headers, cloudflareCf()));
  } catch (err) {
    console.warn("auth callback: could not save sign-up country", err);
  }
}

function cloudflareCf(): { country?: unknown } | undefined {
  try {
    return getCloudflareContext().cf;
  } catch {
    return undefined; // next start / tests: no Cloudflare context
  }
}
