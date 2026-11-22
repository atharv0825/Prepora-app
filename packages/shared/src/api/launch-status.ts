// Country gate contract (M2-B2). Backed by the Postgres RPC public.get_launch_status(p_country),
// called with the public key: POST or GET /rest/v1/rpc/get_launch_status.
import type { Database } from "../db";

export type LaunchStatus = Database["public"]["Enums"]["launch_status"];

export const LAUNCH_STATUS_RPC = "get_launch_status" as const;

/** What the gate falls back to when the status can't be fetched: never let unknowns sign up. */
export const LAUNCH_STATUS_FALLBACK: LaunchStatus = "waitlist";

/**
 * Cleans a CF-IPCountry header (or a stored country) the same way the RPC does: trim, uppercase,
 * and only real two-letter codes. Cloudflare's XX (unknown) and T1 (Tor) become null.
 * Use the result for the RPC argument, for profiles.country_code and for analytics.
 */
export function countryFromHeader(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
  return code;
}

export function isLaunchStatus(value: unknown): value is LaunchStatus {
  return value === "enabled" || value === "waitlist";
}
