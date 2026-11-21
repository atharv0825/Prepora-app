// Supabase client for Server Components, Route Handlers and Server Actions.
// Create one per request (it reads that request's auth cookies). Never share between users.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@prepora/shared/db";
import { getSupabaseEnv } from "./env";

export async function createClient() {
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to ignore:
          // the session refresh in proxy.ts (M1-F2) writes the cookies instead.
        }
      },
    },
  });
}
