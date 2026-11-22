import { NextResponse, type NextRequest } from "next/server";
import { callbackStep, loginUrlWithError } from "@/lib/auth";
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

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(step.code);
    if (error) {
      // Expired/used code, or the PKCE verifier cookie is missing (different browser/device).
      console.warn("auth callback: code exchange failed", error.code ?? error.message);
      return go(loginUrlWithError("callback", step.next));
    }
  } catch (err) {
    console.error("auth callback failed", err);
    return go(loginUrlWithError("config", step.next));
  }

  return go(step.next);
}
