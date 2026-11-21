import { createClient, type SupabaseClient, type User } from "./deps.ts";
import { errors } from "./errors.ts";
import type { Database } from "./db.ts";

/** Supabase client typed against the generated schema (regenerate with `pnpm db:types`). */
export type DbClient = SupabaseClient<Database>;

// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase
// automatically (locally and in the cloud).

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/** Client that acts AS the caller: RLS applies. Use this for anything the user could do. */
export function userClient(req: Request): DbClient {
  const auth = req.headers.get("authorization");
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    global: { headers: auth ? { Authorization: auth } : {} },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client: BYPASSES RLS. Only for server-owned writes (credits, billing, ...). */
export function adminClient(): DbClient {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resolves the signed-in user from the Authorization header.
 * Returns null for anonymous callers (no token, or the anon/publishable key).
 * Throws `unauthorized` if a token is present but invalid or expired.
 */
export async function getUser(req: Request, supabase: DbClient): Promise<User | null> {
  const token = bearerToken(req);
  if (!token || token === Deno.env.get("SUPABASE_ANON_KEY")) return null;
  const { data, error } = await supabase.auth.getUser(token);
  // Auth service unreachable ≠ bad token: surface as a 500 (and Sentry), not a 401.
  if (error?.name === "AuthRetryableFetchError") throw error;
  if (error || !data.user) throw errors.unauthorized("Invalid or expired session");
  return data.user;
}
