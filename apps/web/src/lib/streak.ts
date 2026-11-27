// Practice streak for the home dashboard and the profile. The days are counted in the database
// (get_my_streak); this only loads and checks the result.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@prepora/shared/db";
import { Streak } from "@prepora/shared/api/streak";

/** The signed-in user's streak, checked against the shared contract. Null on any error. */
export async function fetchMyStreak(supabase: SupabaseClient<Database>, days = 7): Promise<Streak | null> {
  const { data, error } = await supabase.rpc("get_my_streak", { p_days: days });
  if (error) return null;
  const parsed = Streak.safeParse(data);
  return parsed.success ? parsed.data : null;
}
