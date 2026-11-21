// Public Supabase settings. NEXT_PUBLIC_* values are inlined at BUILD time, so they must be set
// when `next build` / `opennextjs-cloudflare build` runs (apps/web/.env.local locally,
// GitHub Actions variables in CI). Both values are public by design; RLS protects the data.
//
// Never put the service-role / secret key here: it would ship to the browser.

export class SupabaseConfigError extends Error {
  constructor(missing: string[]) {
    super(`Supabase is not configured: missing ${missing.join(", ")}. See apps/web/.env.example.`);
    this.name = "SupabaseConfigError";
  }
}

export function getSupabaseEnv(): { url: string; publishableKey: string } {
  // Read each variable by its literal name, so Next can inline it.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((v): v is string => Boolean(v));
  if (missing.length) throw new SupabaseConfigError(missing);
  return { url: url!, publishableKey: publishableKey! };
}
