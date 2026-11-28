"use server";

import { revalidatePath } from "next/cache";
import { manualPlanFromForm } from "@prepora/shared/api/admin-billing";
import type { ActionState } from "@/lib/credit-actions";
import { createClient } from "@/lib/supabase/server";

// M9-A1: manual plan change (support). A Server Function is a public endpoint: it validates the
// form and calls admin_set_manual_plan with the admin's own session; the database checks
// is_admin(), changes the plan and writes audit_log in one transaction.

const PLAN = { free: "Free", gold: "Gold", platinum: "Platinum" } as const;

export async function setManualPlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const input = manualPlanFromForm(form);
  if (!input.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of input.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Your session has ended. Sign in again." };

  const v = input.data;
  const { data, error } = await supabase.rpc("admin_set_manual_plan", {
    p_user_id: v.user_id,
    p_plan: v.plan,
    // Always sent: an absent argument makes PostgREST look for a function without it (PGRST202,
    // "Couldn't save" when ending a plan). Free has no days, so null; the generated types mark
    // every argument non-null.
    p_days: (v.days ?? null) as number,
    p_grant_credits: v.grant_credits,
    p_note: v.note,
  });
  if (error) {
    console.error("admin_set_manual_plan failed", error.code, error.message);
    if (error.code === "42501") return { ok: false, message: "Only admins can do this." };
    if (error.code === "P0002") return { ok: false, message: "This user no longer exists." };
    if (error.code === "22023") return { ok: false, message: `Not saved: ${error.message}.` };
    return { ok: false, message: "Couldn't save. Please try again." };
  }
  const result = data as { plan_after: keyof typeof PLAN; credits: number };
  revalidatePath(`/users/${v.user_id}`);
  revalidatePath("/subscriptions");
  const now = `Their plan is now ${PLAN[result.plan_after]}`;
  const message =
    v.plan === "free"
      ? result.plan_after === "free"
        ? `Plan ended. ${now}.`
        : `Manual plan and exam pack ended. ${now}: a monthly subscription is still running (cancel it at the provider).`
      : `${now} for ${v.days} days${result.credits ? `, with ${result.credits} credits` : ""}.`;
  return { ok: true, message, savedAt: Date.now() };
}
