"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProfileUpdate } from "@prepora/shared/types/profile";
import { routes } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

// Account Server Functions (M1-F3). Each one checks the session itself: Server Functions are
// public endpoints, so the middleware guard on /app isn't enough on its own.

/** Ends this browser's session (other devices stay signed in) and goes to the home page. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect(routes.home);
}

export type ProfileFormState =
  | { status: "idle" }
  | { status: "saved"; name: string }
  | { status: "error"; message: string; field?: "full_name" };

export async function updateProfileName(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const parsed = ProfileUpdate.safeParse({ full_name: formData.get("full_name") ?? "" });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", field: "full_name", message: issue?.message ?? "Check your name." };
  }
  const fullName = parsed.data.full_name ?? null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: "error", message: "Your session has ended. Log in again." };

  // RLS: only the caller's row; column grant: only full_name/country_code/timezone (M1-C1).
  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", auth.user.id)
    .select("full_name");

  if (error) {
    console.error("updateProfileName failed", error.code, error.message);
    return { status: "error", message: "Couldn't save your name. Please try again." };
  }
  if (!data?.length) {
    // No profile row yet: created by the sign-up trigger (M1-B2).
    return { status: "error", message: "Your profile isn't set up yet. Please try again shortly." };
  }

  revalidatePath(routes.app, "layout");
  return { status: "saved", name: data[0]!.full_name ?? "" };
}
