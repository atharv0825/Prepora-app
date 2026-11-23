import "server-only";
import { UNKNOWN_COUNTRY, type AdminWaitlistQuery } from "@prepora/shared/api/admin-waitlist";
import type { createClient } from "@/lib/supabase/server";

// Waitlist query shared by the page and the CSV export (M2-A2), so both apply the same filters.
// Reads through RLS: admins see rows, everyone else none.

export const WAITLIST_COLUMNS = "id, email, country_code, source, created_at, invited_at";

type Client = Awaited<ReturnType<typeof createClient>>;

/** Newest first. `count: "exact"` so the page can show a total. */
export function waitlistSelect(supabase: Client, query: Pick<AdminWaitlistQuery, "country" | "status">) {
  let q = supabase.from("waitlist").select(WAITLIST_COLUMNS, { count: "exact" });
  if (query.country === UNKNOWN_COUNTRY) q = q.is("country_code", null);
  else if (query.country) q = q.eq("country_code", query.country);
  if (query.status === "waiting") q = q.is("invited_at", null);
  else if (query.status === "invited") q = q.not("invited_at", "is", null);
  return q.order("created_at", { ascending: false }).order("id", { ascending: false });
}
