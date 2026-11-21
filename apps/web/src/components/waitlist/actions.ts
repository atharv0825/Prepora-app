"use server";

import { headers } from "next/headers";
import { WaitlistInput, type WaitlistResult } from "@prepora/shared/api/waitlist";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";

/**
 * Adds an email to the waitlist (M0-F4). Runs on the server (Cloudflare Worker).
 * Always answers "success" for a valid email, including ones already on the list, so the form
 * can't be used to find out who signed up.
 */
export async function joinWaitlist(
  _previous: WaitlistResult,
  formData: FormData,
): Promise<WaitlistResult> {
  // Honeypot: real people never see or fill this field; bots that fill every input do.
  if (String(formData.get("company") ?? "").length > 0) return { status: "success" };

  const parsed = WaitlistInput.safeParse({
    email: formData.get("email"),
    source: formData.get("source") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", field: "email", message: "Enter a valid email address." };
  }

  // Cloudflare adds the visitor's country; absent locally.
  const country = (await headers()).get("cf-ipcountry") ?? undefined;

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("join_waitlist", {
      p_email: parsed.data.email,
      p_country_code: country,
      p_source: parsed.data.source,
    });
    if (error) {
      // 22023 = rejected by the database's own email check.
      if (error.code === "22023") {
        return { status: "error", field: "email", message: "Enter a valid email address." };
      }
      console.error("join_waitlist failed", error.code, error.message);
      return { status: "error", message: GENERIC_ERROR };
    }
  } catch (err) {
    console.error("join_waitlist failed", err instanceof SupabaseConfigError ? err.message : err);
    return { status: "error", message: GENERIC_ERROR };
  }

  return { status: "success" };
}
