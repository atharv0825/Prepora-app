// Home dashboard overview (M8.6). The numbers are counted in the database (get_my_dashboard);
// this only loads and checks the result.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@prepora/shared/db";
import { DashboardStats } from "@prepora/shared/api/dashboard";

/** The signed-in user's dashboard overview, checked against the shared contract. Null on any error. */
export async function fetchMyDashboard(supabase: SupabaseClient<Database>): Promise<DashboardStats | null> {
  const { data, error } = await supabase.rpc("get_my_dashboard");
  if (error) return null;
  const parsed = DashboardStats.safeParse(data);
  return parsed.success ? parsed.data : null;
}
