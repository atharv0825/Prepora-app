// Country gate (M2-F1, plan §8.2): visitors from countries that aren't launched yet get the
// waitlist instead of sign-up. Pure and Edge-safe: used by src/middleware.ts, which asks the
// database (get_launch_status, M2-B2) and acts on the answer.
import {
  LAUNCH_STATUS_FALLBACK,
  countryFromHeader,
  isLaunchStatus,
  type LaunchStatus,
} from "@prepora/shared/api/launch-status";
import { COUNTRY_HEADER, requestCountry } from "./signup-country";
import { routes } from "./routes";

/**
 * Who the gate applies to:
 *  - `skip`: no Cloudflare country at all (next start and e2e without a faked header; `next dev`
 *    has Wrangler's cached request.cf, so the gate runs there with your real country).
 *    Cloudflare always sends a country (XX when it doesn't know), so a request with neither the
 *    header nor request.cf never comes from the real site.
 *  - `check`: ask the database about this country; null (XX, Tor, junk) is checked too and gets
 *    the waitlist, like any country that isn't enabled.
 */
export type GateInput = { kind: "skip" } | { kind: "check"; country: string | null };

export function gateInput(headers: Headers, cf?: { country?: unknown } | null): GateInput {
  // When the header is there it decides (XX stays unknown): request.cf comes from the same lookup
  // on Cloudflare, and in `next dev` it's Wrangler's cached guess, which a faked header must beat.
  const header = headers.get(COUNTRY_HEADER);
  if (header !== null) return { kind: "check", country: countryFromHeader(header) };
  if (!cf) return { kind: "skip" };
  return { kind: "check", country: requestCountry(headers, cf) };
}

/** Only signed-out visitors opening /signup. Signed-in people are sent on before this. */
export function isGatedPath(pathname: string): boolean {
  return pathname === routes.signup;
}

/** The RPC's answer, or the safe fallback (waitlist) when it failed or returned something odd. */
export function launchStatusOrFallback(data: unknown, failed: boolean): LaunchStatus {
  return !failed && isLaunchStatus(data) ? data : LAUNCH_STATUS_FALLBACK;
}

/** Where a gated visitor goes instead of /signup. */
export function gateRedirect(status: LaunchStatus): string | null {
  return status === "enabled" ? null : routes.waitlistPage;
}
