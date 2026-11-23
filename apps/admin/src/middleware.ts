import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@prepora/shared/db";
import { accessDecision, type Viewer } from "@/lib/access";

// Admin gate (M1-A1). Same Supabase Auth as the student app (Google), but only profiles with
// role admin or content_editor get past it. Everything else, including "no profile row" or a
// failed lookup, is treated as no access (fail closed).
//
// Edge middleware (not Next 16 proxy.ts) for the same reason as apps/web: proxy.ts runs on
// Node.js, which OpenNext on Cloudflare only supports experimentally.
//
// Roles are read from public.profiles with the user's own session: RLS lets each user read only
// their own row (M1-C1), and role can't be self-edited (column grant). The admin layout checks
// again before rendering anything.

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  let response = NextResponse.next({ request });
  let cacheHeaders: Record<string, string> = {};
  let viewer: Viewer = { signedIn: false };

  if (url && key) {
    const supabase = createServerClient<Database>(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
          cacheHeaders = headers;
          for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
        },
      },
    });
    // Nothing between createServerClient and getClaims (Supabase guidance).
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims?.sub;
    if (userId) {
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (error) console.error("admin middleware: role lookup failed", error.code);
      viewer = { signedIn: true, role: profile?.role ?? null };
    }
  }

  const decision = accessDecision(request.nextUrl, viewer);
  if (decision.action === "redirect") {
    const redirect = NextResponse.redirect(new URL(decision.to, request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    for (const [k, v] of Object.entries(cacheHeaders)) redirect.headers.set(k, v);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  // Every admin page is per-user.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Everything except static files, so no admin page can be reached without the check.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|robots.txt|monitoring).*)"],
};
