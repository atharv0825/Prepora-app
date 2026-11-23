import { expect, test } from "@playwright/test";
import { AllowanceResult, RefundResult, SpendResult } from "@prepora/shared/api/credits";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M3-B7: the credit functions under real concurrency against local Supabase. Many calls are
// fired at once through PostgREST (separate database connections), as parallel Edge Function
// invocations would. pgTAP runs in one session, so it can't race; the sequential rules (cap,
// expiry order, refunds) are in supabase/tests/database/credits_engine.test.sql.
// No browser needed, so it runs once (desktop project only).

const PARALLEL = 12;

test.describe("credits under concurrency", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  const users: TestUser[] = [];
  const db = adminClient();

  /** A fresh user (sign-up grant: 10 welcome + 8 monthly), optionally on another plan. */
  async function newUser(plan: "free" | "gold" | "platinum" = "free"): Promise<TestUser> {
    const user = await createTestUser(`Concurrency ${plan}`);
    users.push(user);
    if (plan !== "free") {
      const { error } = await db.from("profiles").update({ plan }).eq("id", user.id);
      expect(error).toBeNull();
    }
    return user;
  }

  async function spendMany(userId: string, actionKey: string, n = PARALLEL) {
    const results = await Promise.all(
      Array.from({ length: n }, () => db.rpc("spend_credits", { p_user_id: userId, p_action_key: actionKey })),
    );
    for (const r of results) expect(r.error, "no database error under contention").toBeNull();
    return results.map((r) => SpendResult.parse(r.data));
  }

  /** Every bucket's remaining = the sum of its ledger entries, and nothing is negative. */
  async function expectLedgerExplainsBuckets(userId: string) {
    const [{ data: buckets }, { data: ledger }] = await Promise.all([
      db.from("credit_buckets").select("id, remaining, granted").eq("user_id", userId),
      db.from("credit_ledger").select("bucket_id, delta").eq("user_id", userId),
    ]);
    for (const b of buckets ?? []) {
      const sum = (ledger ?? []).filter((l) => l.bucket_id === b.id).reduce((s, l) => s + l.delta, 0);
      expect(b.remaining, `bucket ${b.id}`).toBe(sum);
      expect(b.remaining).toBeGreaterThanOrEqual(0);
      expect(b.remaining).toBeLessThanOrEqual(b.granted);
    }
  }

  const balance = async (userId: string) => (await db.rpc("credit_balance", { p_user_id: userId })).data as number;

  test.afterAll(async () => {
    await Promise.all(users.map((u) => deleteTestUser(u)));
  });

  test("parallel spends never overdraw the balance", async () => {
    // Platinum: cap 60, so only the 18-credit balance limits. 18 / 6 = exactly 3 spends.
    const user = await newUser("platinum");
    const results = await spendMany(user.id, "speaking_p3");

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.code === "insufficient_credits")).toHaveLength(PARALLEL - 3);
    expect(await balance(user.id)).toBe(0);
    // Each success saw a consistent balance: 12, 6, 0 in some order.
    expect(results.flatMap((r) => (r.ok ? [r.balance_after] : [])).sort((a, b) => a - b)).toEqual([0, 6, 12]);
    await expectLedgerExplainsBuckets(user.id);
  });

  test("parallel spends respect the daily cap", async () => {
    // Free: 18 credits but a daily cap of 8. 8 / 4 = exactly 2 spends today.
    const user = await newUser("free");
    const results = await spendMany(user.id, "writing_t2");

    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.code === "daily_cap_reached")).toHaveLength(PARALLEL - 2);
    expect(await balance(user.id)).toBe(10);
    const spentToday = (await db.rpc("credits_spent_today", { p_user_id: user.id })).data;
    expect(spentToday).toBe(8);
    await expectLedgerExplainsBuckets(user.id);
  });

  test("parallel spends still take the soonest-expiring bucket first", async () => {
    // Platinum with a 4-credit topup expiring in 5 days, 8 monthly (1 month), 10 welcome (never).
    const user = await newUser("platinum");
    await db.rpc("grant_credits", {
      p_user_id: user.id,
      p_source: "topup",
      p_amount: 4,
      p_expires_at: new Date(Date.now() + 5 * 864e5).toISOString(),
    });
    const results = await spendMany(user.id, "writing_t1", 3); // 3 × 4 = 12 = topup 4 + monthly 8
    expect(results.every((r) => r.ok)).toBe(true);

    const { data: buckets } = await db.from("credit_buckets").select("source, remaining").eq("user_id", user.id);
    // Sorted here: .order("source") would follow the enum's declared order, not the alphabet.
    expect([...(buckets ?? [])].sort((a, b) => a.source.localeCompare(b.source))).toEqual([
      { source: "monthly", remaining: 0 },
      { source: "topup", remaining: 0 },
      { source: "welcome", remaining: 10 },
    ]);
    await expectLedgerExplainsBuckets(user.id);
  });

  test("parallel refunds of one reservation refund it once", async () => {
    const user = await newUser("free");
    const [spent] = await spendMany(user.id, "writing_t2", 1);
    if (!spent?.ok) throw new Error("expected a spend");
    expect(await balance(user.id)).toBe(14);

    const refunds = await Promise.all(
      Array.from({ length: PARALLEL }, () => db.rpc("refund_credits", { p_reservation_id: spent.reservation_id })),
    );
    const parsed = refunds.map((r) => {
      expect(r.error).toBeNull();
      return RefundResult.parse(r.data);
    });
    expect(parsed.filter((r) => r.ok && r.status === "refunded")).toHaveLength(1);
    expect(parsed.filter((r) => r.ok && r.status === "already_refunded")).toHaveLength(PARALLEL - 1);
    expect(await balance(user.id)).toBe(18);
    await expectLedgerExplainsBuckets(user.id);
  });

  test("spends and refunds racing each other stay consistent", async () => {
    // Gold (cap 40). Spend 4 twice, then refund both while spending more in parallel.
    const user = await newUser("gold");
    const first = await spendMany(user.id, "writing_t2", 2);
    const reservations = first.flatMap((r) => (r.ok ? [r.reservation_id] : []));
    expect(reservations).toHaveLength(2);

    await Promise.all([
      ...reservations.map((id) => db.rpc("refund_credits", { p_reservation_id: id })),
      ...Array.from({ length: 6 }, () => db.rpc("spend_credits", { p_user_id: user.id, p_action_key: "writing_t2" })),
    ]);

    // Balance never went negative, and it equals 18 − 4 × (successful spends not refunded).
    const { data: ledger } = await db.from("credit_ledger").select("reason, delta").eq("user_id", user.id);
    const net = (ledger ?? []).reduce((s, l) => s + l.delta, 0);
    expect(await balance(user.id)).toBe(net);
    expect(net).toBeGreaterThanOrEqual(0);
    await expectLedgerExplainsBuckets(user.id);
  });

  test("parallel allowance uses don't exceed the plan's limit", async () => {
    const user = await newUser("free"); // 2 reading tests a month
    const results = await Promise.all(
      Array.from({ length: PARALLEL }, () => db.rpc("use_allowance", { p_user_id: user.id, p_type: "reading_tests" })),
    );
    const parsed = results.map((r) => {
      expect(r.error).toBeNull();
      return AllowanceResult.parse(r.data);
    });
    expect(parsed.filter((r) => r.ok)).toHaveLength(2);
    expect(parsed.filter((r) => !r.ok)).toHaveLength(PARALLEL - 2);
    const { data } = await db.from("usage_allowance").select("reading_tests_used").eq("user_id", user.id).single();
    expect(data?.reading_tests_used).toBe(2);
  });
});
