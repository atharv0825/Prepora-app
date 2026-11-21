// Single place for third-party versions used by Edge Functions.
// Every function and _shared module imports from here, so all of them share one copy
// (important for `instanceof ZodError`, Sentry's global hub, etc.).
export { z, ZodError } from "npm:zod@4.6.7";
export type { ZodType } from "npm:zod@4.6.7";
export { createClient } from "npm:@supabase/supabase-js@2.119.2";
export type { SupabaseClient, User } from "npm:@supabase/supabase-js@2.119.2";
export * as Sentry from "npm:@sentry/deno@11.16.0";
