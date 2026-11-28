// Error contract (M0-C2): every failure is returned as
//   { "error": { "code": "<snake_case>", "message": "<human readable>", "details"?: ... } }
// `details` is only set for `validation_failed` (list of field issues).

export type ErrorCode =
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

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }

  toBody(): ErrorBody {
    const error: ErrorBody["error"] = { code: this.code, message: this.message };
    if (this.details !== undefined) error.details = this.details;
    return { error };
  }
}

export const errors = {
  badRequest: (msg = "Bad request") => new HttpError(400, "bad_request", msg),
  validation: (details: unknown) =>
    new HttpError(400, "validation_failed", "Request validation failed", details),
  unauthorized: (msg = "Authentication required") => new HttpError(401, "unauthorized", msg),
  forbidden: (msg = "You don't have access to this resource") =>
    new HttpError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new HttpError(404, "not_found", msg),
  methodNotAllowed: (allowed: string[]) =>
    new HttpError(405, "method_not_allowed", `Allowed methods: ${allowed.join(", ")}`),
  conflict: (msg = "Conflict") => new HttpError(409, "conflict", msg),
  insufficientCredits: (msg = "Not enough credits") =>
    new HttpError(402, "insufficient_credits", msg),
  // M3-C3. Statuses match creditErrorStatus in packages/shared/src/api/credits.ts.
  dailyCapReached: (msg = "Daily credit limit reached") =>
    new HttpError(429, "daily_cap_reached", msg),
  allowanceExceeded: (msg = "Monthly allowance used up") =>
    new HttpError(402, "allowance_exceeded", msg),
  featureNotInPlan: (msg = "Not included in your plan") =>
    new HttpError(403, "feature_not_in_plan", msg),
  // M9-C2. Statuses match billingErrorStatus in packages/shared/src/api/billing.ts.
  priceNotAvailable: (msg = "This option isn't available in your country") =>
    new HttpError(422, "price_not_available", msg),
  alreadySubscribed: (msg = "You already have a plan") =>
    new HttpError(409, "already_subscribed", msg),
  rateLimited: (msg = "Too many requests") => new HttpError(429, "rate_limited", msg),
  wrongRegion: (expected: string, actual: string) =>
    new HttpError(421, "wrong_region", `Must be invoked in ${expected}, ran in ${actual}`),
  internal: (msg = "Something went wrong") => new HttpError(500, "internal", msg),
};
