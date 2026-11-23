// Supabase client for Server Components, Route Handlers and Server Actions (admin).
// One per request: it reads that request's auth cookies.
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
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components can't write cookies; src/middleware.ts refreshes the session instead.
        }
      },
    },
  });
}
