import { NextResponse, type NextRequest } from "next/server";
import { adminNext, adminRoutes } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

// Google OAuth return URL for the admin (M1-A1). Exchanges ?code= for a session cookie on this
// subdomain, then goes to `next`. The middleware decides on the next request whether the role
// is allowed in, so a non-staff account lands on /forbidden.
// Requires <admin origin>/** in the Supabase redirect allowlist (docs/auth.md).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = adminNext(searchParams.get("next"));
  const go = (path: string) => NextResponse.redirect(new URL(path, origin));

  const error = searchParams.get("error");
  const code = searchParams.get("code");
  if (error || !code) {
    return go(`${adminRoutes.login}?error=${error === "access_denied" ? "cancelled" : "callback"}`);
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.warn("admin auth callback: code exchange failed", exchangeError.code ?? exchangeError.message);
      return go(`${adminRoutes.login}?error=callback`);
    }
  } catch (err) {
    console.error("admin auth callback failed", err);
    return go(`${adminRoutes.login}?error=config`);
  }
  return go(next);
}
