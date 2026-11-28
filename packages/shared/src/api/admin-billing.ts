// Admin billing contract (M9-A1): admin_list_subscriptions, admin_billing_summary,
// admin_set_manual_plan (supabase/migrations/20261208090000_admin_billing.sql).
import { z } from "zod";
import type { Database } from "../db";

type Enums = Database["public"]["Enums"];

export type AdminSubscriptionRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  plan_id: Enums["plan_tier"];
  kind: Enums["price_kind"];
  provider: Enums["payment_provider"];
  status: Enums["subscription_status"];
  current_period_end: string;
  cancel_at_period_end: boolean;
  scheduled_plan_id: Enums["plan_tier"] | null;
  currency: string | null;
  amount_minor: number | null;
  created_at: string;
  total_count: number;
};

export const AdminBillingSummary = z.object({
  revenue: z.array(
    z.object({
      currency: z.string(),
      payments: z.number().int(),
      gross_minor: z.number().int(),
      refunded_minor: z.number().int(),
      net_minor: z.number().int(),
      net_30d_minor: z.number().int(),
    }),
  ),
  active: z.object({ gold: z.number().int(), platinum: z.number().int(), past_due: z.number().int(), cancelling: z.number().int() }),
  unprocessed_events: z.number().int(),
  failed_events: z.number().int(),
});
export type AdminBillingSummary = z.infer<typeof AdminBillingSummary>;

export const SUBSCRIPTIONS_PAGE_SIZE = 50;

/** The manual plan form (support). free ends manual plans, so it needs no length. */
export const ManualPlanInput = z
  .object({
    user_id: z.uuid(),
    plan: z.enum(["free", "gold", "platinum"]),
    days: z.coerce.number().int().min(1, "1 to 366 days.").max(366, "1 to 366 days.").optional(),
    grant_credits: z.boolean(),
    note: z.string().trim().min(3, "Add a note of at least 3 characters (why, ticket number).").max(500, "At most 500 characters."),
  })
  .refine((v) => v.plan === "free" || v.days !== undefined, { path: ["days"], message: "How many days?" });
export type ManualPlanInput = z.infer<typeof ManualPlanInput>;

/** FormData → ManualPlanInput (the checkbox is "on" when ticked; days is blank for free). */
export function manualPlanFromForm(form: FormData) {
  const days = String(form.get("days") ?? "").trim();
  return ManualPlanInput.safeParse({
    user_id: form.get("user_id"),
    plan: form.get("plan"),
    days: days === "" ? undefined : days,
    grant_credits: form.get("grant_credits") === "on",
    note: form.get("note") ?? "",
  });
}
