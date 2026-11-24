import { describe, expect, it } from "vitest";
import { CreditBalance, creditErrorCodes, creditErrorMessages } from "@prepora/shared/api/credits";
import {
  type LedgerEntry,
  allowanceMeters,
  checkCost,
  creditErrorView,
  creditsText,
  expiryText,
  historyRows,
  meterPercent,
  nextExpiry,
  signedCredits,
  toCreditError,
} from "./credits";
import { routes } from "./routes";

const balance = CreditBalance.parse({
  plan: "free",
  balance: 10,
  buckets: [
    { id: "00000000-0000-4000-8000-000000000001", source: "monthly", granted: 8, remaining: 2, expires_at: "2026-12-01T00:00:00Z" },
    { id: "00000000-0000-4000-8000-000000000002", source: "welcome", granted: 10, remaining: 8, expires_at: null },
  ],
  spent_today: 4,
  daily_cap: 8,
  period_start: "2026-11-01",
  allowances: [
    { type: "reading_tests", used: 1, limit: 2 },
    { type: "listening_tests", used: 2, limit: 2 },
    { type: "practice_sessions", used: 0, limit: 5 },
    { type: "mock_tests", used: 0, limit: 0 },
  ],
});

describe("expiryText", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  it.each([
    [null, "Never expires"],
    ["2026-11-24T23:00:00Z", "Expires today"],
    ["2026-11-25T08:00:00Z", "Expires tomorrow"],
    ["2026-11-29T00:00:00Z", "Expires in 5 days"],
    ["2026-12-08T00:00:00Z", "Expires in 14 days"],
    ["2027-01-03T00:00:00Z", "Expires on 3 Jan 2027"],
  ])("%s → %s (UTC)", (at, text) => {
    expect(expiryText(at, null, now)).toBe(text);
  });

  it("counts days in the student's time zone", () => {
    // 23:30 UTC on the 24th is already 05:00 on the 25th in Kolkata. An expiry at 17:00 UTC on
    // the 25th (22:30 there) is tomorrow in UTC but today in Kolkata.
    const late = new Date("2026-11-24T23:30:00Z");
    expect(expiryText("2026-11-25T17:00:00Z", "UTC", late)).toBe("Expires tomorrow");
    expect(expiryText("2026-11-25T17:00:00Z", "Asia/Kolkata", late)).toBe("Expires today");
  });
});

describe("summary helpers", () => {
  it("allowance meters: remaining, and limit 0 means not in the plan", () => {
    expect(allowanceMeters(balance).map((a) => [a.type, a.remaining, a.included])).toEqual([
      ["reading_tests", 1, true],
      ["listening_tests", 0, true],
      ["practice_sessions", 5, true],
      ["mock_tests", 0, false],
    ]);
  });

  it("meterPercent is clamped and full for a zero limit", () => {
    expect(meterPercent(1, 2)).toBe(50);
    expect(meterPercent(3, 2)).toBe(100);
    expect(meterPercent(0, 0)).toBe(100);
    expect(meterPercent(1, 3)).toBe(33);
  });

  it("nextExpiry skips buckets that never expire", () => {
    expect(nextExpiry(balance)).toEqual({ remaining: 2, expiresAt: "2026-12-01T00:00:00Z" });
    expect(nextExpiry({ buckets: [balance.buckets[1]!] })).toBeNull();
  });

  it("formats credit counts", () => {
    expect(creditsText(1)).toBe("1 credit");
    expect(creditsText(4)).toBe("4 credits");
    expect(signedCredits(4)).toBe("+4");
    expect(signedCredits(-4)).toBe("−4");
  });
});

describe("checkCost (M3-F2)", () => {
  it("ok with the balance after", () => {
    expect(checkCost(balance, 4, "writing_t2")).toEqual({ ok: true, balanceAfter: 6 });
  });

  it("balance first, as spend_credits does", () => {
    // 12 > 10 credits and 4 + 12 > 8 cap: the balance is reported.
    expect(checkCost(balance, 12, "x")).toMatchObject({ ok: false, code: "insufficient_credits", details: { credits: 12, balance: 10 } });
  });

  it("then the daily cap", () => {
    expect(checkCost(balance, 5, "speaking_p1")).toMatchObject({
      ok: false,
      code: "daily_cap_reached",
      details: { credits: 5, daily_cap: 8, spent_today: 4 },
    });
  });

  it("exactly reaching the cap or the balance is allowed", () => {
    expect(checkCost({ ...balance, spent_today: 0, daily_cap: 10 }, 10)).toEqual({ ok: true, balanceAfter: 0 });
  });
});

describe("credit errors (M3-F3)", () => {
  it("picks out credit errors and ignores others", () => {
    expect(toCreditError({ code: "insufficient_credits", details: { credits: 4, balance: 1, action_key: "writing_t2" } })).toEqual({
      code: "insufficient_credits",
      details: { credits: 4, balance: 1, action_key: "writing_t2" },
    });
    expect(toCreditError({ code: "internal", details: undefined })).toBeNull();
    expect(toCreditError(null)).toBeNull();
  });

  it("bad details don't break the dialog", () => {
    expect(toCreditError({ code: "daily_cap_reached", details: { daily_cap: "eight" } })).toEqual({ code: "daily_cap_reached", details: {} });
    expect(toCreditError({ code: "daily_cap_reached", details: "nope" })).toEqual({ code: "daily_cap_reached", details: {} });
  });

  it("every code has a title, body and at least one action to the placeholder", () => {
    for (const code of creditErrorCodes) {
      const view = creditErrorView({ code, details: {} });
      expect(view.title).toBe(creditErrorMessages[code].title);
      expect(view.actions.length).toBeGreaterThan(0);
      for (const a of view.actions) expect([routes.upgrade, routes.topUp]).toContain(a.href);
      expect(view.actions.filter((a) => a.primary).length).toBeLessThanOrEqual(1);
    }
  });

  it("out of credits: top up first, then plans, with the numbers", () => {
    const view = creditErrorView({ code: "insufficient_credits", details: { credits: 4, balance: 1 } });
    expect(view.actions.map((a) => [a.label, a.primary])).toEqual([["Top up credits", true], ["See plans", false]]);
    expect(view.detail).toBe("This costs 4 credits. You have 1.");
  });

  it("details per code", () => {
    expect(creditErrorView({ code: "daily_cap_reached", details: { daily_cap: 8, spent_today: 6, credits: 4 } }).detail).toBe(
      "You've used 6 of today's 8 credits, and this costs 4. Higher plans have a higher daily limit.",
    );
    expect(creditErrorView({ code: "allowance_exceeded", details: { type: "reading_tests", used: 2, limit: 2 } }).detail).toBe(
      "You've used 2 of 2 reading tests this month.",
    );
    expect(creditErrorView({ code: "feature_not_in_plan", details: { feature: "ocr" } }).detail).toBe(
      "Photo upload of handwritten answers isn't included in your plan.",
    );
    expect(creditErrorView({ code: "feature_not_in_plan", details: {} }).detail).toBeNull();
  });
});

describe("historyRows", () => {
  const costs = { writing_t2: { label: "Writing Task 2 scored", credits: 4 } };
  const at = "2026-11-24T10:00:00Z";
  const e = (id: number, over: Partial<LedgerEntry>): LedgerEntry => ({
    id,
    delta: 0,
    reason: "grant",
    action_key: null,
    reservation_id: null,
    created_at: at,
    bucket: null,
    ...over,
  });

  it("merges one spend across buckets and its refund, newest first", () => {
    const rows = historyRows(
      [
        e(1, { delta: 10, reason: "grant", bucket: { source: "welcome" } }),
        e(2, { delta: 8, reason: "grant", bucket: { source: "monthly" } }),
        e(3, { delta: -1, reason: "spend", action_key: "writing_t2", reservation_id: "r1", bucket: { source: "monthly" } }),
        e(4, { delta: -3, reason: "spend", action_key: "writing_t2", reservation_id: "r1", bucket: { source: "welcome" } }),
        e(5, { delta: 1, reason: "refund", action_key: "writing_t2", reservation_id: "r1" }),
        e(6, { delta: 3, reason: "refund", action_key: "writing_t2", reservation_id: "r1" }),
        e(7, { delta: -2, reason: "expire", bucket: { source: "monthly" } }),
        e(8, { delta: 5, reason: "admin_adjust" }),
      ],
      costs,
    );
    expect(rows.map((r) => [r.label, r.delta])).toEqual([
      ["Adjusted by Prepora support", 5],
      ["Monthly credits expired", -2],
      ["Refund: Writing Task 2 scored", 4],
      ["Writing Task 2 scored", -4],
      ["Monthly credits added", 8],
      ["Welcome credits added", 10],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("falls back when the action or bucket is unknown", () => {
    const rows = historyRows(
      [e(1, { delta: -2, reason: "spend", action_key: "retired_action", reservation_id: "r" }), e(2, { delta: 3, reason: "grant" })],
      costs,
    );
    expect(rows.map((r) => r.label)).toEqual(["Credits added", "retired_action"]);
  });
});
