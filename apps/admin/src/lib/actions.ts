"use server";

import { redirect } from "next/navigation";
import { adminRoutes } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

/** Ends the admin session on this device and returns to the login page (M1-A1). */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(adminRoutes.login);
}
