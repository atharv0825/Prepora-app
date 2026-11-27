import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import type { CreditBalance } from "@prepora/shared/api/credits";
import type { Streak } from "@prepora/shared/api/streak";
import type { Profile } from "@prepora/shared/types/profile";
import { displayName } from "@/lib/account";
import { type CreditCosts, fetchCreditCosts, fetchMyCredits } from "@/lib/credits";
import { fetchMyStreak } from "@/lib/streak";
import { fetchMyDashboard } from "@/lib/dashboard-stats";
import type { DashboardStats } from "@prepora/shared/api/dashboard";
import { SupabaseConfigError } from "./env";
import { createClient } from "./server";

/**
 * The signed-in user for this request, or null. getUser() asks Supabase Auth to validate the
 * token (unlike getSession(), which trusts the cookie). Null when Supabase isn't configured.
 * Cached per request, so the layout and the page share one Auth call.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user;
  } catch (err) {
    if (err instanceof SupabaseConfigError) return null;
    throw err;
  }
});

export type Account = {
  user: User;
  /** The user's profiles row; null until M1-B2's sign-up trigger has created it. */
  profile: Profile | null;
  name: string;
  email: string | null;
};

/** User + profile for the signed-in area (M1-F3). Null when signed out. Cached per request. */
export const getAccount = cache(async (): Promise<Account | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  // RLS returns only the caller's own row (M1-C1).
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return {
    user,
    profile,
    name: displayName(profile?.full_name, user.user_metadata, user.email),
    email: user.email ?? null,
  };
});

/**
 * The signed-in user's credits (M3-B5 get_my_credits), or null when signed out or on any error
 * (the UI then shows no balance rather than a wrong one). Cached per request: the header chip,
 * the home card and the credits page share one call.
 */
export const getMyCredits = cache(async (): Promise<CreditBalance | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return fetchMyCredits(await createClient());
});

/**
 * The signed-in user's practice streak (get_my_streak) with the practice days among the last
 * `days` (7 for the dashboard, 84 for the profile). Null when signed out or on any error.
 */
export const getMyStreak = cache(async (days: number = 7): Promise<Streak | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return fetchMyStreak(await createClient(), days);
});

/** The signed-in user's dashboard overview (get_my_dashboard), or null when signed out or on any error. */
export const getMyDashboard = cache(async (): Promise<DashboardStats | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return fetchMyDashboard(await createClient());
});

/** Active credit costs and labels (public table). Cached per request. */
export const getCreditCosts = cache(async (): Promise<CreditCosts> => fetchCreditCosts(await createClient()));
