"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Country waves (M2-A2). A Server Function is a public endpoint, so it checks everything itself;
// the database has the final say (RLS: only admins may update country_regions.is_enabled).

export type CountryToggleResult = { ok: true; enabled: boolean } | { ok: false; message: string };

export async function setCountryEnabled(countryCode: unknown, enabled: unknown): Promise<CountryToggleResult> {
  if (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode) || typeof enabled !== "boolean") {
    return { ok: false, message: "Invalid request." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Your session has ended. Sign in again." };

  const { data, error } = await supabase
    .from("country_regions")
    .update({ is_enabled: enabled })
    .eq("country_code", countryCode)
    .select("is_enabled");

  if (error) {
    console.error("setCountryEnabled failed", error.code, error.message);
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  // RLS hides the row from non-admins, so nothing was updated.
  if (!data?.length) return { ok: false, message: "Only admins can change launch countries." };

  revalidatePath("/countries");
  return { ok: true, enabled: data[0]!.is_enabled };
}
