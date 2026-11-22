import "server-only";
import { cache } from "react";
import type { Role } from "@prepora/shared/types/profile";
import { createClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/supabase/env";

export type Viewer = {
  id: string;
  email: string | null;
  name: string;
  /** null when the profile row is missing (treated as no access). */
  role: Role | null;
};

/**
 * The signed-in person and their role, or null when signed out. getUser() validates the session
 * with Supabase Auth; the role comes from their own profiles row (RLS). Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    const meta = user.user_metadata ?? {};
    const name =
      profile?.full_name?.trim() ||
      (typeof meta.full_name === "string" && meta.full_name) ||
      (typeof meta.name === "string" && meta.name) ||
      user.email ||
      "Account";
    return { id: user.id, email: user.email ?? null, name, role: profile?.role ?? null };
  } catch (err) {
    if (err instanceof SupabaseConfigError) return null;
    throw err;
  }
});
