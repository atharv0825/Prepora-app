import type { SupabaseClient } from "@supabase/supabase-js";
import { countryFromHeader } from "@prepora/shared/api/launch-status";
import type { Database } from "@prepora/shared/db";

// M2-B3: remember the country someone signed up from (plan §8.2, §9: sign-ups by country).
// Cloudflare sets CF-IPCountry on every request to the Worker; request.cf.country is the same
// value and is the fallback when the zone's IP Geolocation header is turned off.

export const COUNTRY_HEADER = "cf-ipcountry";

/** The visitor's country as a clean ISO code, or null when unknown (local dev, XX, Tor). */
export function requestCountry(headers: Headers, cf?: { country?: unknown } | null): string | null {
  const fromHeader = countryFromHeader(headers.get(COUNTRY_HEADER));
  if (fromHeader) return fromHeader;
  return typeof cf?.country === "string" ? countryFromHeader(cf.country) : null;
}

export type SignupCountryResult = "saved" | "unchanged" | "unknown";

/**
 * Saves the country on the signed-in user's own profile, only while it is still empty: the first
 * sign-in sets it, later sign-ins (maybe from another country, or after the person changed it
 * themselves) leave it alone. Uses the user's session, so RLS and the column grant from M1-C1
 * apply: nobody can write another person's row. Throws on database errors.
 */
export async function recordSignupCountry(
  supabase: SupabaseClient<Database>,
  userId: string,
  country: string | null,
): Promise<SignupCountryResult> {
  if (!country) return "unknown";
  const { data, error } = await supabase
    .from("profiles")
    .update({ country_code: country })
    .eq("id", userId)
    .is("country_code", null)
    .select("id");
  if (error) throw error;
  return data.length > 0 ? "saved" : "unchanged";
}
