// Local Supabase for end-to-end tests (M1-I1).
//
// Google can't be automated, so tests create real users with the service role and sign them in
// through the admin API (generate a magic-link token, verify it): a genuine Supabase session,
// with the email provider still disabled for real users.
//
// Keys come from `supabase status` (local CLI defaults); nothing secret is stored in the repo.
// Safety: this refuses to run against anything but a local Supabase.
import { execSync } from "node:child_process";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@prepora/shared/db";

export type LocalSupabase = { url: string; publishableKey: string; secretKey: string };

let cached: LocalSupabase | undefined;

function readStatus(): Record<string, string> {
  const repoRoot = path.resolve(__dirname, "../../../..");
  // The CLI talks to Docker; give a slow start one more try.
  for (let attempt = 1; ; attempt++) {
    try {
      const raw = execSync("supabase status -o json", { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] }).toString();
      return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, string>;
    } catch {
      if (attempt >= 2) throw new Error("Local Supabase isn't running. Start it with `supabase start` (repo root) first.");
    }
  }
}

/**
 * Resolved once in Playwright's main process (playwright.config.ts) and handed to the test workers
 * through E2E_SUPABASE_* environment variables, so the workers don't each call the CLI.
 */
export function localSupabase(): LocalSupabase {
  if (cached) return cached;
  let url = process.env.E2E_SUPABASE_URL;
  let publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
  let secretKey = process.env.E2E_SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) {
    const json = readStatus();
    url = json.API_URL;
    publishableKey = json.PUBLISHABLE_KEY ?? json.ANON_KEY;
    secretKey = json.SECRET_KEY ?? json.SERVICE_ROLE_KEY;
  }
  if (!url || !publishableKey || !secretKey) throw new Error("`supabase status` didn't return API_URL and keys.");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`Refusing to run e2e tests against a non-local Supabase (${host}).`);
  }
  process.env.E2E_SUPABASE_URL = url;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  process.env.E2E_SUPABASE_SECRET_KEY = secretKey;
  cached = { url, publishableKey, secretKey };
  return cached;
}

export function adminClient(): SupabaseClient<Database> {
  const { url, secretKey } = localSupabase();
  return createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  /** A client signed in as this user (anon key + their session): what the browser would have. */
  client: SupabaseClient<Database>;
  /** The auth cookies @supabase/ssr would set, for Playwright's context.addCookies(). */
  cookies: { name: string; value: string }[];
};

/** Profile answers of someone who finished onboarding (M2-F2), so /app shows the home page. */
export const ONBOARDED = { test_type: "academic", target_band: 7 } as const;

/**
 * Creates a user + profile row and signs them in. Delete with deleteTestUser().
 * `profile` adds columns to the row, e.g. ONBOARDED; without it the user still needs onboarding.
 */
export async function createTestUser(
  fullName: string,
  role: "user" | "admin" | "content_editor" = "user",
  profile: Partial<Pick<Database["public"]["Tables"]["profiles"]["Insert"], "test_type" | "target_band" | "exam_date" | "timezone">> = {},
): Promise<TestUser> {
  const admin = adminClient();
  const { url, publishableKey } = localSupabase();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) throw createError ?? new Error("createUser failed");
  const id = created.user.id;

  // Stand-in for M1-B2's sign-up trigger: make sure the profile row exists.
  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id, full_name: fullName, role, ...profile }, { onConflict: "id" });
  if (profileError) throw profileError;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError) throw linkError;
  const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyError || !verified.session) throw verifyError ?? new Error("verifyOtp returned no session");
  const session = verified.session;

  const jar = new Map<string, string>();
  const ssr = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => list.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });

  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });

  return {
    id,
    email,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    client,
    cookies: [...jar].map(([name, value]) => ({ name, value })),
  };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (user) await adminClient().auth.admin.deleteUser(user.id); // profile goes with it (cascade)
}
