import "server-only";
import type { User } from "@supabase/supabase-js";
import { SupabaseConfigError } from "./env";
import { createClient } from "./server";

/**
 * The signed-in user for this request, or null. getUser() asks Supabase Auth to validate the
 * token (unlike getSession(), which trusts the cookie). Null when Supabase isn't configured.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch (err) {
    if (err instanceof SupabaseConfigError) return null;
    throw err;
  }
}
