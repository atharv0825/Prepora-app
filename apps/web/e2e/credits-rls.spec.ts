import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@prepora/shared/db";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M3-C1/C2: plans & credits through the real API (PostgREST) with real sessions.
// Reference data is public; balances are private and read-only for users; nobody but the
// service role writes. No browser needed, so it runs once (desktop project only).

test.describe("credits RLS", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let a: TestUser;
  let b: TestUser;

  test.beforeAll(async () => {
    [a, b] = await Promise.all([createTestUser("Credit A"), createTestUser("Credit B")]);
    // Grants are server-side (M3-B4); the service role stands in for them here.
    const db = adminClient();
    for (const user of [a, b]) {
      const { data: bucket, error } = await db
        .from("credit_buckets")
        .insert({ user_id: user.id, source: "welcome", granted: 10, remaining: 10 })
        .select("id")
        .single();
      expect(error).toBeNull();
      await db.from("credit_ledger").insert({ user_id: user.id, bucket_id: bucket!.id, delta: 10, reason: "grant" });
    }
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

  test("a user reads only their own buckets and ledger", async () => {
    const buckets = await a.client.from("credit_buckets").select("user_id, remaining");
    expect(buckets.error).toBeNull();
    expect(buckets.data).toEqual([{ user_id: a.id, remaining: 10 }]);
    const ledger = await a.client.from("credit_ledger").select("user_id").eq("user_id", b.id);
    expect(ledger.data).toEqual([]);
  });

  test("a user can't give themselves credits or read AI costs", async () => {
    const grant = await a.client.from("credit_ledger").insert({ user_id: a.id, delta: 1000, reason: "grant" });
    expect(grant.error?.code).toBe("42501");
    const bump = await a.client.from("credit_buckets").update({ remaining: 10 }).eq("user_id", a.id);
    expect(bump.error?.code).toBe("42501");
    const usage = await a.client.from("ai_usage").select("id");
    expect(usage.error?.code).toBe("42501");
    const plan = await a.client.from("plans").update({ name: "Mine" }).eq("id", "free");
    expect(plan.error?.code).toBe("42501");
  });
});
