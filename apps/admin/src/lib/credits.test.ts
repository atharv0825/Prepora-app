import { describe, expect, it } from "vitest";
import type { AdminLedgerEntry } from "@prepora/shared/api/admin-credits";
import { auditBy, auditNote, auditText, costNote, ledgerRows, signedCredits, underBudget } from "./credits";

const labels = { writing_t2: "Writing Task 2 scored", speaking_p1: "Speaking Part 1 scored" };

describe("costNote / underBudget (M3-A1)", () => {
  it("shows the budget against the estimate", () => {
    expect(costNote(4, 0.032)).toBe("$0.04 budget · $0.032 estimated");
    expect(costNote(1, null)).toBe("$0.01 budget · cost not estimated yet");
  });

  it("flags a price below the estimated cost", () => {
    expect(underBudget(4, 0.032)).toBe(false);
    expect(underBudget(3, 0.032)).toBe(true);
    expect(underBudget(0, null)).toBe(false);
  });
});

describe("ledgerRows (M3-A2)", () => {
  const e = (id: number, over: Partial<AdminLedgerEntry>): AdminLedgerEntry => ({
    id,
    delta: 1,
    reason: "grant",
    action_key: null,
    reservation_id: null,
    bucket_source: null,
    created_at: "2026-11-24T10:00:00Z",
    refunded: false,
    ...over,
  });

  it("merges a spend across buckets and its refund; spends keep their reservation", () => {
    const rows = ledgerRows(
      [
        e(1, { delta: 10, bucket_source: "welcome" }),
        e(2, { delta: 8, bucket_source: "monthly" }),
        e(3, { delta: -6, reason: "spend", action_key: "writing_t2", reservation_id: "r1", bucket_source: "monthly", refunded: true }),
        e(4, { delta: -2, reason: "spend", action_key: "writing_t2", reservation_id: "r1", bucket_source: "welcome", refunded: true }),
        e(5, { delta: 6, reason: "refund", action_key: "writing_t2", reservation_id: "r1", bucket_source: "monthly" }),
        e(6, { delta: 2, reason: "refund", action_key: "writing_t2", reservation_id: "r1", bucket_source: "welcome" }),
        e(7, { delta: -5, reason: "spend", action_key: "speaking_p1", reservation_id: "r2", bucket_source: "welcome" }),
        e(8, { delta: 20, bucket_source: "admin" }),
      ],
      labels,
    );
    expect(rows.map((r) => [r.label, r.buckets, r.delta, r.reservationId, r.refunded])).toEqual([
      ["Credits granted", "Admin grant", 20, null, false],
      ["Speaking Part 1 scored", "Welcome", -5, "r2", false],
      ["Refund: Writing Task 2 scored", "Welcome + Monthly", 8, null, false],
      ["Writing Task 2 scored", "Welcome + Monthly", -8, "r1", true],
      ["Credits granted", "Monthly", 8, null, false],
      ["Credits granted", "Welcome", 10, null, false],
    ]);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it("falls back for unknown actions and missing buckets", () => {
    const rows = ledgerRows([e(1, { delta: -2, reason: "expire" }), e(2, { delta: -1, reason: "spend", action_key: "old_action", reservation_id: "r" })], labels);
    expect(rows.map((r) => [r.label, r.buckets])).toEqual([
      ["old_action", "—"],
      ["Credits expired", "—"],
    ]);
  });

  it("signs credits", () => {
    expect(signedCredits(3)).toBe("+3");
    expect(signedCredits(-3)).toBe("−3");
  });
});

describe("audit text", () => {
  it("describes each action", () => {
    expect(
      auditText({
        action: "plan.update",
        entity_id: "free",
        details: { changes: { monthly_credits: { from: 8, to: 10 }, ocr: { from: false, to: true } } },
      }),
    ).toBe("Free plan: monthly credits 8 → 10, OCR off → on");
    expect(auditText({ action: "credit_cost.update", entity_id: "writing_t2", details: { changes: { credits: { from: 4, to: 5 } } } }, labels)).toBe(
      "Writing Task 2 scored: credits 4 → 5",
    );
    expect(auditText({ action: "credits.grant", entity_id: "u", details: { amount: 20, expires_at: "2026-12-24T10:00:00Z" } })).toBe(
      "Granted 20 credits, expires 24 Dec 2026",
    );
    expect(auditText({ action: "credits.grant", entity_id: "u", details: { amount: 5, expires_at: null } })).toBe("Granted 5 credits, never expires");
    expect(auditText({ action: "credits.refund", entity_id: "u", details: { refunded: 4, action_key: "writing_t2" } }, labels)).toBe(
      "Refunded 4 credits: Writing Task 2 scored",
    );
    expect(auditText({ action: "something.else", entity_id: null, details: {} })).toBe("something.else");
  });

  it("note and author", () => {
    expect(auditNote({ details: { note: "ticket 12" } })).toBe("ticket 12");
    expect(auditNote({ details: {} })).toBeNull();
    expect(auditBy({ admin_name: " ", admin_email: "boss@prepora.test" })).toBe("boss@prepora.test");
    expect(auditBy({ admin_name: null, admin_email: null })).toBe("A deleted admin");
  });
});
