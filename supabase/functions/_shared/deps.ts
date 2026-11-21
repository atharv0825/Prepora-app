// Single place for third-party versions used by Edge Functions.
// Every function and _shared module imports from here, so all of them share one copy
// (important for `instanceof ZodError`, Sentry's global hub, etc.).
//
// Upgrading: pick versions published > 24 h ago (Deno 2 and pnpm refuse newer ones), then run
// `deno check health/index.ts` with Deno 2 inside supabase/functions to refresh deno.lock, and
// commit it. CI runs `deno check --frozen`.
export { z, ZodError } from "npm:zod@4.6.7";
export type { ZodType } from "npm:zod@4.6.7";
export { createClient } from "npm:@supabase/supabase-js@2.119.2";
export type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.119.2";
export * as Sentry from "npm:@sentry/deno@11.14.0";
