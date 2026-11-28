// Error contract shared with Edge Functions (supabase/functions/_shared/errors.ts, M0-C2):
//   { "error": { "code": "<snake_case>", "message": "...", "details"?: ... } }

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "insufficient_credits"
  // Credits & allowances (M3-C3): see packages/shared/src/api/credits.ts.
  | "daily_cap_reached"
  | "allowance_exceeded"
  | "feature_not_in_plan"
  // Billing (M9-C2): see packages/shared/src/api/billing.ts.
  | "price_not_available"
  | "already_subscribed"
  | "rate_limited"
  | "wrong_region"
  | "internal";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const e = (value as { error: unknown }).error;
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as { code?: unknown }).code === "string" &&
    typeof (e as { message?: unknown }).message === "string"
  );
}
