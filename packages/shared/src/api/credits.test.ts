import { describe, expect, it } from "vitest";
import {
  AllowanceResult,
  CreditBalance,
  PlanLimits,
  RefundResult,
  SpendResult,
  allowanceRemaining,
  creditErrorCodes,
  creditErrorMessages,
  creditErrorStatus,
  isCreditErrorCode,
  spendableToday,
} from "./credits";

const freeLimits = {
  monthly_credits: 8,
  welcome_credits: 10,
  daily_credit_cap: 8,
  reading_tests: 2,
  listening_tests: 2,
  practice_sessions: 5,
  mock_tests: 0,
  ocr: false,
  ai_gen: false,
  premium_voice: false,
  detailed_feedback: false,
};

describe("PlanLimits", () => {
  it("accepts the seeded Free plan", () => {
    expect(PlanLimits.parse(freeLimits)).toEqual(freeLimits);
  });

  it.each([
    ["a missing key", (() => { const { ocr: _ocr, ...rest } = freeLimits; return rest; })()],
    ["an unknown key", { ...freeLimits, unlimited: true }],
    ["a negative count", { ...freeLimits, monthly_credits: -1 }],
    ["a fractional count", { ...freeLimits, daily_credit_cap: 2.5 }],
    ["a non-boolean flag", { ...freeLimits, ocr: "yes" }],
  ])("rejects %s (like plan_limits_valid)", (_label, value) => {
    expect(PlanLimits.safeParse(value).success).toBe(false);
  });
});

describe("SpendResult", () => {
  it("parses a successful spend", () => {
    const ok = {
      ok: true,
      reservation_id: "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f",
      action_key: "writing_t2",
      credits: 4,
      balance_after: 14,
      spent_today: 4,
    };
    expect(SpendResult.parse(ok)).toEqual(ok);
  });

  it("parses each refusal with its context", () => {
    expect(SpendResult.parse({ ok: false, code: "insufficient_credits", action_key: "speaking_p3", credits: 6, balance: 2 }).ok).toBe(false);
    expect(
      SpendResult.parse({ ok: false, code: "daily_cap_reached", action_key: "writing_t1", credits: 4, daily_cap: 8, spent_today: 8 }),
    ).toMatchObject({ code: "daily_cap_reached" });
    expect(SpendResult.parse({ ok: false, code: "feature_not_in_plan", action_key: "ocr", credits: 1, feature: "ocr" })).toMatchObject({
      feature: "ocr",
    });
  });

  it.each([
    ["an unknown action", { ok: true, reservation_id: "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f", action_key: "speaking_full", credits: 15, balance_after: 0, spent_today: 15 }],
    ["a success without a reservation", { ok: true, action_key: "ocr", credits: 1, balance_after: 0, spent_today: 1 }],
    ["an allowance error (that's use_allowance's)", { ok: false, code: "allowance_exceeded", action_key: "ocr", credits: 1 }],
    ["a negative balance", { ok: true, reservation_id: "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f", action_key: "ocr", credits: 1, balance_after: -1, spent_today: 1 }],
    ["extra fields", { ok: false, code: "insufficient_credits", action_key: "ocr", credits: 1, secret: "x" }],
  ])("rejects %s", (_label, value) => {
    expect(SpendResult.safeParse(value).success).toBe(false);
  });
});

describe("RefundResult", () => {
  const id = "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f";

  it("parses refunded, already refunded and not found", () => {
    expect(RefundResult.parse({ ok: true, status: "refunded", reservation_id: id, refunded: 4, balance_after: 18 }).ok).toBe(true);
    expect(RefundResult.parse({ ok: true, status: "already_refunded", reservation_id: id, refunded: 0, balance_after: 18 }).ok).toBe(true);
    expect(RefundResult.parse({ ok: false, status: "not_found", reservation_id: id, refunded: 0 }).ok).toBe(false);
  });

  it("rejects a not-found result that claims a refund", () => {
    expect(RefundResult.safeParse({ ok: false, status: "not_found", reservation_id: id, refunded: 4 }).success).toBe(false);
  });
});

describe("AllowanceResult", () => {
  it("parses success and allowance_exceeded", () => {
    expect(AllowanceResult.parse({ ok: true, type: "reading_tests", used: 2, limit: 2 }).ok).toBe(true);
    expect(AllowanceResult.parse({ ok: false, code: "allowance_exceeded", type: "mock_tests", used: 0, limit: 0 }).ok).toBe(false);
    expect(AllowanceResult.safeParse({ ok: false, code: "insufficient_credits", type: "mock_tests", used: 0, limit: 0 }).success).toBe(false);
  });
});

describe("CreditBalance", () => {
  const balance = {
    plan: "free",
    balance: 18,
    buckets: [
      { id: "3f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f", source: "monthly", granted: 8, remaining: 8, expires_at: "2026-12-23T00:00:00+00:00" },
      { id: "4f1c2b9e-8a7d-4c6b-9e2f-1a2b3c4d5e6f", source: "welcome", granted: 10, remaining: 10, expires_at: null },
    ],
    spent_today: 0,
    daily_cap: 8,
    period_start: "2026-11-23",
    allowances: [{ type: "reading_tests", used: 1, limit: 2 }],
  };

  it("parses what get-my-credits returns, with Postgres timestamps", () => {
    expect(CreditBalance.parse(balance)).toEqual(balance);
  });

  it("rejects an unknown plan or bucket source", () => {
    expect(CreditBalance.safeParse({ ...balance, plan: "diamond" }).success).toBe(false);
    expect(CreditBalance.safeParse({ ...balance, buckets: [{ ...balance.buckets[0], source: "gift" }] }).success).toBe(false);
  });

  it("spendable today = the lower of balance and what's left of the cap", () => {
    expect(spendableToday(balance)).toBe(8);
    expect(spendableToday({ balance: 3, daily_cap: 8, spent_today: 0 })).toBe(3);
    expect(spendableToday({ balance: 18, daily_cap: 8, spent_today: 6 })).toBe(2);
    expect(spendableToday({ balance: 18, daily_cap: 8, spent_today: 9 })).toBe(0);
  });

  it("allowance remaining never goes negative", () => {
    expect(allowanceRemaining({ used: 1, limit: 2 })).toBe(1);
    expect(allowanceRemaining({ used: 3, limit: 2 })).toBe(0);
  });
});

describe("credit errors", () => {
  it("recognises the four codes", () => {
    expect(creditErrorCodes).toEqual(["insufficient_credits", "daily_cap_reached", "allowance_exceeded", "feature_not_in_plan"]);
    expect(isCreditErrorCode("daily_cap_reached")).toBe(true);
    expect(isCreditErrorCode("DAILY_CAP_REACHED")).toBe(false);
    expect(isCreditErrorCode("forbidden")).toBe(false);
  });

  it("has a status and a message for every code", () => {
    for (const code of creditErrorCodes) {
      expect(creditErrorStatus[code]).toBeGreaterThanOrEqual(400);
      expect(creditErrorMessages[code].title.length).toBeGreaterThan(0);
      expect(creditErrorMessages[code].body.length).toBeGreaterThan(0);
    }
  });
});
