"use server";

import { revalidatePath } from "next/cache";
import {
  AdminCreditCostUpdate,
  AdminGrantInput,
  AdminGrantResult,
  AdminRefundInput,
  adminGrantArgs,
  planLimitsFromForm,
} from "@prepora/shared/api/admin-credits";
import { PlanTier, RefundResult } from "@prepora/shared/api/credits";
import { createClient } from "@/lib/supabase/server";

// Plans & credits (M3-A1) and a user's credits (M3-A2). Server Functions are public endpoints,
// so each one validates its input and calls an admin-only RPC with the admin's own session: the
// database checks is_admin(), applies the change and writes audit_log in one transaction.

export type ActionState = {
  ok: boolean;
  message: string;
  /** Field name → first problem, for the form to show next to the input. */
  fieldErrors?: Record<string, string>;
  /** Changes the form's key after a success, so it resets (useActionState keeps old state). */
  savedAt?: number;
};

function fieldErrors(issues: readonly { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    out[key] ??= i.message;
  }
  return out;
}

/** Database errors in words; details go to the server log only. */
function failure(context: string, error: { code?: string; message: string }): ActionState {
  console.error(`${context} failed`, error.code, error.message);
  if (error.code === "42501") return { ok: false, message: "Only admins can do this." };
  if (error.code === "P0002") return { ok: false, message: "Not found. Reload the page and try again." };
  if (error.code === "22023") return { ok: false, message: `Not saved: ${error.message}.` };
  return { ok: false, message: "Couldn't save. Please try again." };
}

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? supabase : null;
}

const SESSION_ENDED: ActionState = { ok: false, message: "Your session has ended. Sign in again." };

// ── M3-A1 ───────────────────────────────────────────────────────────────────────────────────
export async function updatePlan(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = PlanTier.safeParse(form.get("plan_id"));
  if (!id.success) return { ok: false, message: "Invalid request." };
  const limits = planLimitsFromForm(form);
  if (!limits.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(limits.error.issues) };
  }

  const supabase = await signedIn();
  if (!supabase) return SESSION_ENDED;
  const { data, error } = await supabase.rpc("admin_update_plan", { p_id: id.data, p_limits: limits.data });
  if (error) return failure("admin_update_plan", error);

  const changed = Number((data as { changed?: number } | null)?.changed ?? 0);
  revalidatePath("/plans");
  return {
    ok: true,
    message: changed === 0 ? "No changes to save." : `Saved ${changed} ${changed === 1 ? "change" : "changes"}.`,
    savedAt: Date.now(),
  };
}

export async function updateCreditCost(_prev: ActionState, form: FormData): Promise<ActionState> {
  const input = AdminCreditCostUpdate.safeParse({ action_key: form.get("action_key"), credits: form.get("credits") });
  if (!input.success) {
    return { ok: false, message: "Enter 0 to 1000 whole credits.", fieldErrors: fieldErrors(input.error.issues) };
  }

  const supabase = await signedIn();
  if (!supabase) return SESSION_ENDED;
  const { data, error } = await supabase.rpc("admin_update_credit_cost", {
    p_action_key: input.data.action_key,
    p_credits: input.data.credits,
  });
  if (error) return failure("admin_update_credit_cost", error);

  const changed = (data as { changed?: boolean } | null)?.changed === true;
  revalidatePath("/plans");
  return { ok: true, message: changed ? `Now ${input.data.credits} credits.` : "No change.", savedAt: Date.now() };
}

// ── M3-A2 ───────────────────────────────────────────────────────────────────────────────────
export async function grantCredits(_prev: ActionState, form: FormData): Promise<ActionState> {
  const input = AdminGrantInput.safeParse({
    user_id: form.get("user_id"),
    amount: form.get("amount"),
    expires_in_days: form.get("expires_in_days"),
    note: form.get("note"),
  });
  if (!input.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  }

  const supabase = await signedIn();
  if (!supabase) return SESSION_ENDED;
  const { data, error } = await supabase.rpc("admin_grant_credits", adminGrantArgs(input.data));
  if (error) return failure("admin_grant_credits", error);

  const result = AdminGrantResult.safeParse(data);
  revalidatePath(`/users/${input.data.user_id}`);
  return {
    ok: true,
    message: result.success
      ? `Granted ${result.data.amount} credits. New balance: ${result.data.balance_after}.`
      : `Granted ${input.data.amount} credits.`,
    savedAt: Date.now(),
  };
}

export async function refundCredits(_prev: ActionState, form: FormData): Promise<ActionState> {
  const input = AdminRefundInput.safeParse({
    user_id: form.get("user_id"),
    reservation_id: form.get("reservation_id"),
    note: form.get("note"),
  });
  if (!input.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(input.error.issues) };
  }

  const supabase = await signedIn();
  if (!supabase) return SESSION_ENDED;
  const { data, error } = await supabase.rpc("admin_refund_credits", {
    p_user_id: input.data.user_id,
    p_reservation_id: input.data.reservation_id,
    p_note: input.data.note,
  });
  if (error) return failure("admin_refund_credits", error);

  revalidatePath(`/users/${input.data.user_id}`);
  const result = RefundResult.safeParse(data);
  if (!result.success) return { ok: true, message: "Refunded.", savedAt: Date.now() };
  if (!result.data.ok) return { ok: false, message: "That spend wasn't found for this user." };
  if (result.data.status === "already_refunded") return { ok: true, message: "Already refunded. Nothing changed.", savedAt: Date.now() };
  return {
    ok: true,
    message: `Refunded ${result.data.refunded} credits. New balance: ${result.data.balance_after}.`,
    savedAt: Date.now(),
  };
}
