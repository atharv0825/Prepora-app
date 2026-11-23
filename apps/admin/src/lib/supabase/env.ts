// Public Supabase settings for the admin app (same project as the student app). NEXT_PUBLIC_*
// values are inlined at build time: apps/admin/.env.local locally, GitHub repository variables
// in CI. Never put the service-role / secret key here.

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(`Supabase is not configured: missing ${missing.join(", ")}. See apps/admin/.env.example.`);
    this.name = "SupabaseConfigError";
  }
}

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((v): v is string => Boolean(v));
  if (missing.length) throw new SupabaseConfigError(missing);
  return { url: url!, publishableKey: publishableKey! };
}
