import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { AllowanceResult, CreditBalance, RefundResult, SpendResult } from "@prepora/shared/api/credits";
import type { Database } from "@prepora/shared/db";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M3: plans & credits through the real API (PostgREST) with real sessions.
// Reference data is public; balances are private and read-only for users; the credit functions
// (M3-B1…B4) are for the service role (Edge Functions) only, and their JSON matches the shared
// Zod contract (M3-C3). No browser needed, so it runs once (desktop project only).

test.describe("credits", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let a: TestUser;
  let b: TestUser;

  test.beforeAll(async () => {
    // Creating the users fires the sign-up grant (M3-B4): 10 welcome + 8 monthly each.
    [a, b] = await Promise.all([createTestUser("Credit A"), createTestUser("Credit B")]);
  });

  test.afterAll(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]); // buckets and ledger cascade
  });

  test("anyone can read plans and credit costs, signed out too", async () => {
    const { url, publishableKey } = localSupabase();
    const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
    const plans = await anon.from("plans").select("id, limits").order("id");
    expect(plans.error).toBeNull();
    expect(plans.data?.map((p) => p.id)).toEqual(["free", "gold", "platinum"]);
    const costs = await anon.from("credit_costs").select("action_key, credits").eq("action_key", "writing_t2").single();
    expect(costs.data).toEqual({ action_key: "writing_t2", credits: 4 });
  });

  test("a new user has 18 credits and reads only their own buckets and ledger", async () => {
    const buckets = await a.client.from("credit_buckets").select("user_id, source, remaining").order("source");
    expect(buckets.error).toBeNull();
    expect(buckets.data).toEqual([
      { user_id: a.id, source: "monthly", remaining: 8 },
      { user_id: a.id, source: "welcome", remaining: 10 },
    ]);
    const ledger = await a.client.from("credit_ledger").select("user_id").eq("user_id", b.id);
    expect(ledger.data).toEqual([]);
  });

  test("get_my_credits (M3-B5) returns the user's own CreditBalance", async () => {
    const { data, error } = await a.client.rpc("get_my_credits");
    expect(error).toBeNull();
    const balance = CreditBalance.parse(data); // real Postgres JSON against the shared contract
    expect(balance).toMatchObject({ plan: "free", balance: 18, spent_today: 0, daily_cap: 8 });
    expect(balance.buckets.map((b) => [b.source, b.remaining])).toEqual([["monthly", 8], ["welcome", 10]]);
    expect(balance.buckets[0]!.expires_at).not.toBeNull();
    expect(balance.allowances.map((x) => x.type)).toEqual(["reading_tests", "listening_tests", "practice_sessions", "mock_tests"]);

    const { url, publishableKey } = localSupabase();
    const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
    expect((await anon.rpc("get_my_credits")).error).not.toBeNull();
  });

  test("a user can't give themselves credits, spend, refund or read AI costs", async () => {
    const grant = await a.client.from("credit_ledger").insert({ user_id: a.id, delta: 1000, reason: "grant" });
    expect(grant.error?.code).toBe("42501");
    const bump = await a.client.from("credit_buckets").update({ remaining: 10 }).eq("user_id", a.id);
    expect(bump.error?.code).toBe("42501");
    const usage = await a.client.from("ai_usage").select("id");
    expect(usage.error?.code).toBe("42501");
    const plan = await a.client.from("plans").update({ name: "Mine" }).eq("id", "free");
    expect(plan.error?.code).toBe("42501");

    // The credit functions take a user id, so they're service-role only.
    const spend = await a.client.rpc("spend_credits", { p_user_id: b.id, p_action_key: "writing_t2" });
    expect(spend.error).not.toBeNull();
    const refund = await a.client.rpc("refund_credits", { p_reservation_id: crypto.randomUUID() });
    expect(refund.error).not.toBeNull();
    const allowance = await a.client.rpc("use_allowance", { p_user_id: a.id, p_type: "reading_tests" });
    expect(allowance.error).not.toBeNull();
    const maintenance = await a.client.rpc("run_credit_maintenance");
    expect(maintenance.error).not.toBeNull();
  });

  test("the service role spends, refunds and counts allowances, matching the shared contract", async () => {
    const db = adminClient();

    const spent = SpendResult.parse((await db.rpc("spend_credits", { p_user_id: b.id, p_action_key: "writing_t2" })).data);
    expect(spent).toMatchObject({ ok: true, credits: 4, balance_after: 14, spent_today: 4 });

    const refused = SpendResult.parse((await db.rpc("spend_credits", { p_user_id: b.id, p_action_key: "ocr" })).data);
    expect(refused).toMatchObject({ ok: false, code: "feature_not_in_plan", feature: "ocr" });

    if (!spent.ok) throw new Error("expected a successful spend");
    const refund = RefundResult.parse((await db.rpc("refund_credits", { p_reservation_id: spent.reservation_id })).data);
    expect(refund).toMatchObject({ ok: true, status: "refunded", refunded: 4, balance_after: 18 });

    const used = AllowanceResult.parse((await db.rpc("use_allowance", { p_user_id: b.id, p_type: "reading_tests" })).data);
    expect(used).toEqual({ ok: true, type: "reading_tests", used: 1, limit: 2 });

    // What the user sees afterwards (RLS): the full history of their own credits.
    const history = await b.client.from("credit_ledger").select("delta, reason").order("id");
    expect(history.data?.map((h) => `${h.reason}:${h.delta}`)).toEqual(["grant:10", "grant:8", "spend:-4", "refund:4"]);
  });
});
