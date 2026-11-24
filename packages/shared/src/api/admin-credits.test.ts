import { describe, expect, it } from "vitest";
import { AdminCreditCostUpdate, AdminGrantInput, AdminRefundInput, adminGrantArgs, planLimitsFromForm } from "./admin-credits";

const userId = "00000000-0000-4000-8000-000000000001";

function planForm(over: Record<string, string | null> = {}): FormData {
  const values: Record<string, string | null> = {
    monthly_credits: "8",
    welcome_credits: "10",
    daily_credit_cap: "8",
    reading_tests: "2",
    listening_tests: "2",
    practice_sessions: "5",
    mock_tests: "0",
    ocr: null,
    ai_gen: null,
    premium_voice: "on",
    detailed_feedback: null,
    ...over,
  };
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) if (v !== null) form.set(k, v);
  return form;
}

describe("planLimitsFromForm (M3-A1)", () => {
  it("reads numbers and checkboxes into complete limits", () => {
    const parsed = planLimitsFromForm(planForm({ monthly_credits: " 12 " }));
    expect(parsed.success && parsed.data).toEqual({
      monthly_credits: 12,
      welcome_credits: 10,
      daily_credit_cap: 8,
      reading_tests: 2,
      listening_tests: 2,
      practice_sessions: 5,
      mock_tests: 0,
      ocr: false,
      ai_gen: false,
      premium_voice: true,
      detailed_feedback: false,
    });
  });

  it.each([
    ["negative", { mock_tests: "-1" }, "mock_tests"],
    ["decimal", { reading_tests: "2.5" }, "reading_tests"],
    ["empty", { daily_credit_cap: "" }, "daily_credit_cap"],
    ["missing", { welcome_credits: null }, "welcome_credits"],
    ["too big", { monthly_credits: "100001" }, "monthly_credits"],
  ])("refuses a %s count and names the field", (_, over, field) => {
    const parsed = planLimitsFromForm(planForm(over));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path[0])).toContain(field);
  });

  it("ignores fields that aren't limits", () => {
    const form = planForm();
    form.set("unlimited", "on");
    expect(planLimitsFromForm(form).success).toBe(true);
  });
});

describe("credit cost (M3-A1)", () => {
  it("accepts 0–1000 whole credits", () => {
    expect(AdminCreditCostUpdate.parse({ action_key: "writing_t2", credits: "5" })).toEqual({ action_key: "writing_t2", credits: 5 });
    expect(AdminCreditCostUpdate.safeParse({ action_key: "writing_t2", credits: "1001" }).success).toBe(false);
    expect(AdminCreditCostUpdate.safeParse({ action_key: "writing_t2", credits: "-1" }).success).toBe(false);
    expect(AdminCreditCostUpdate.safeParse({ action_key: "Bad Key", credits: "1" }).success).toBe(false);
  });
});

describe("grant and refund (M3-A2)", () => {
  it("grant: trims the note, never = null expiry", () => {
    const input = AdminGrantInput.parse({ user_id: userId, amount: "20", expires_in_days: "never", note: "  outage  " });
    expect(input).toEqual({ user_id: userId, amount: 20, expires_in_days: null, note: "outage" });
    expect(adminGrantArgs(input)).toEqual({ p_user_id: userId, p_amount: 20, p_expires_in_days: null, p_note: "outage" });
    expect(AdminGrantInput.parse({ user_id: userId, amount: "5", expires_in_days: "30", note: "ticket 12" }).expires_in_days).toBe(30);
  });

  it.each([
    ["no credits", { amount: "0" }, "amount"],
    ["too many credits", { amount: "1001" }, "amount"],
    ["part credits", { amount: "1.5" }, "amount"],
    ["a short note", { note: " ok " }, "note"],
    ["a bad expiry", { expires_in_days: "0" }, "expires_in_days"],
  ])("grant refuses %s", (_, over, field) => {
    const parsed = AdminGrantInput.safeParse({ user_id: userId, amount: "5", expires_in_days: "30", note: "ticket 12", ...over });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path[0]).toBe(field);
  });

  it("refund needs ids and a note", () => {
    expect(AdminRefundInput.safeParse({ user_id: userId, reservation_id: userId, note: "bad feedback" }).success).toBe(true);
    expect(AdminRefundInput.safeParse({ user_id: userId, reservation_id: "nope", note: "bad feedback" }).success).toBe(false);
    expect(AdminRefundInput.safeParse({ user_id: userId, reservation_id: userId, note: "" }).success).toBe(false);
  });
});
