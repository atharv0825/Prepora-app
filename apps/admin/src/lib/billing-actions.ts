"use server";

import { revalidatePath } from "next/cache";
import { FunctionRegion, FunctionsHttpError } from "@supabase/supabase-js";
import { isApiErrorBody } from "@prepora/shared/api/errors";
import { PINNED_FUNCTION_REGION } from "@prepora/shared/api/regions";
import { manualPlanFromForm } from "@prepora/shared/api/admin-billing";
import type { ActionState } from "@/lib/credit-actions";
import { createClient } from "@/lib/supabase/server";

// M9-A1: manual plan change (support). Free goes through the admin-end-plan Edge Function: it
// holds the provider keys, so it can cancel a monthly Razorpay / Paddle subscription now as well
// as ending manual plans and exam packs. A Server Function is a public endpoint: it validates the
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
  if (v.plan === "free") return endPlan(supabase, v.user_id, v.note);
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
  const message = `${now} for ${v.days} days${result.credits ? `, with ${result.credits} credits` : ""}.`;
  return { ok: true, message, savedAt: Date.now() };
}

/** Free: everything ends, including a monthly subscription (cancelled now at the provider). */
async function endPlan(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, note: string): Promise<ActionState> {
  const { data, error } = await supabase.functions.invoke<{ plan_after: keyof typeof PLAN; cancelled: number }>("admin-end-plan", {
    body: { user_id: userId, note },
    region: PINNED_FUNCTION_REGION as FunctionRegion,
  });
  if (error) {
    const body: unknown = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null;
    console.error("admin-end-plan failed", isApiErrorBody(body) ? body.error.code : error.message);
    if (isApiErrorBody(body) && body.error.code !== "internal") return { ok: false, message: body.error.message };
    return { ok: false, message: "Couldn't end the plan. Please try again." };
  }
  revalidatePath(`/users/${userId}`);
  revalidatePath("/subscriptions");
  const cancelled = data?.cancelled ? ` Their monthly subscription was cancelled at the provider (no refund).` : "";
  return { ok: true, message: `All plans ended. Their plan is now ${PLAN[data?.plan_after ?? "free"]}.${cancelled}`, savedAt: Date.now() };
}
