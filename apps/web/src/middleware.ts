import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { LAUNCH_STATUS_RPC, type LaunchStatus } from "@prepora/shared/api/launch-status";
import type { Database } from "@prepora/shared/db";
import { nextPath } from "@/lib/auth";
import { routeDecision } from "@/lib/auth-routes";
import { gateInput, gateRedirect, isGatedPath, launchStatusOrFallback } from "@/lib/country-gate";

// Session handling (M1-F2), following Supabase's @supabase/ssr guide for Next.js:
//  1. Refresh the session: getClaims() verifies the access token and, when it has expired, uses
//     the refresh token. New tokens are written to BOTH the request (so Server Components in
//     this request see them) and the response (so the browser stores them).
//  2. Protect /app/*: signed-out → /login?next=…; signed in on /login or /signup → onward.
//  3. Country gate (M2-F1): signed out on /signup from a country not launched yet → /waitlist.
//
// Why middleware.ts (Edge) and not Next 16's proxy.ts: proxy.ts runs on Node.js, which OpenNext
// on Cloudflare only supports experimentally ("not officially maintained"). Edge middleware is the
// supported path. Next 16 still runs middleware.ts (it logs a deprecation notice).
//
// Pages still call getCurrentUser() themselves when they need the user; this is the gate, not
// the only check.

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};

  let signedIn = false;
  let supabase: SupabaseClient<Database> | null = null;
  if (url && key) {
    supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Responses that set auth cookies must never be cached (another user could get them).
          cacheHeaders = headers;
          for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
        },
      },
    });
    // Don't put code between createServerClient and getClaims (Supabase guidance): a missed
    // refresh logs people out at random.
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims?.sub);
  }

  const redirectTo = (to: string) => {
    const redirect = NextResponse.redirect(new URL(to, request.url));
    // Keep any refreshed (or cleared) session cookies on the redirect too.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [k, v] of Object.entries(cacheHeaders)) redirect.headers.set(k, v);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  };

  const decision = routeDecision(request.nextUrl, signedIn, nextPath(request.nextUrl.searchParams.get("next")));
  if (decision.action === "redirect") return redirectTo(decision.to);

  // M2-F1: country gate. Signed-out visitors on /signup from a country that isn't launched yet
  // go to the waitlist page. The answer depends on the visitor's country, so it's never cached.
  if (!signedIn && isGatedPath(request.nextUrl.pathname)) {
    const input = gateInput(request.headers, cloudflareCf());
    if (input.kind === "check") {
      const to = gateRedirect(await launchStatus(supabase, input.country));
      if (to) return redirectTo(to);
      response.headers.set("Cache-Control", "private, no-store");
    }
  }

  // Signed-in pages are per-user: never cache them in a shared cache.
  if (signedIn) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

/** get_launch_status (M2-B2), public. Any failure → the waitlist (never open by mistake). */
async function launchStatus(supabase: SupabaseClient<Database> | null, country: string | null): Promise<LaunchStatus> {
  if (!supabase) return launchStatusOrFallback(null, true);
  try {
    const { data, error } = await supabase.rpc(LAUNCH_STATUS_RPC, { p_country: country ?? "" });
    if (error) console.warn("country gate: get_launch_status failed", error.code ?? error.message);
    return launchStatusOrFallback(data, Boolean(error));
  } catch (err) {
    console.warn("country gate: get_launch_status failed", err);
    return launchStatusOrFallback(null, true);
  }
}

function cloudflareCf(): { country?: unknown } | undefined {
  try {
    return getCloudflareContext().cf;
  } catch {
    return undefined; // next start / tests: no Cloudflare context
  }
}

export const config = {
  // Only where a session matters: the app, and the auth pages (to skip them when signed in).
  // Marketing pages and /auth/callback (which sets the session itself) don't run this.
  matcher: ["/app", "/app/:path*", "/login", "/signup"],
};
