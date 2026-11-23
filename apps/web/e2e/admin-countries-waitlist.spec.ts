import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@prepora/shared/db";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M2-A2: country waves and the waitlist through the real API (PostgREST) with real sessions, as
// the admin panel calls them with the public key. Admins only; the database decides.
// No browser needed, so it runs once (desktop project only).
// The toggle uses the Philippines (Wave 2, off in the seed): country-gate.spec.ts relies on
// Vietnam staying closed and may run at the same time.

test.describe("admin countries and waitlist", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let admin: TestUser;
  let student: TestUser;
  const tag = `e2e-${Date.now()}`;
  const emails = [`${tag}-a@example.com`, `${tag}-b@example.com`];

  test.beforeAll(async () => {
    [admin, student] = await Promise.all([createTestUser("Admin Person", "admin"), createTestUser("Some Student")]);
    // Join the waitlist the way the public form does (anon key, join_waitlist RPC).
    const { url, publishableKey } = localSupabase();
    const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
    for (const email of emails) {
      const { error } = await anon.rpc("join_waitlist", { p_email: email, p_country_code: "VN", p_source: "signup_gate" });
      expect(error).toBeNull();
    }
  });

  test.afterAll(async () => {
    const db = adminClient();
    await db.from("waitlist").delete().in("email", emails);
    await db.from("country_regions").update({ is_enabled: false }).eq("country_code", "PH");
    await Promise.all([deleteTestUser(admin), deleteTestUser(student)]);
  });

  test("an admin enables the Philippines and the gate opens; a student can't", async () => {
    const asStudent = await student.client.from("country_regions").update({ is_enabled: true }).eq("country_code", "PH").select();
    expect(asStudent.error).toBeNull();
    expect(asStudent.data).toEqual([]); // RLS: no row updated

    const { data, error } = await admin.client
      .from("country_regions")
      .update({ is_enabled: true })
      .eq("country_code", "PH")
      .select("country_code, is_enabled");
    expect(error).toBeNull();
    expect(data).toEqual([{ country_code: "PH", is_enabled: true }]);
    expect((await student.client.rpc("get_launch_status", { p_country: "PH" })).data).toBe("enabled");

    await admin.client.from("country_regions").update({ is_enabled: false }).eq("country_code", "PH");
    expect((await student.client.rpc("get_launch_status", { p_country: "PH" })).data).toBe("waitlist");
  });

  test("only admins can read the waitlist and its counts", async () => {
    const own = await admin.client.from("waitlist").select("email, country_code, source").in("email", emails).order("email");
    expect(own.error).toBeNull();
    expect(own.data).toEqual(emails.map((email) => ({ email, country_code: "VN", source: "signup_gate" })));

    const counts = await admin.client.rpc("admin_waitlist_by_country");
    expect(counts.data?.find((c) => c.country_code === "VN")?.waiting).toBeGreaterThanOrEqual(2);

    const asStudent = await student.client.from("waitlist").select("email").in("email", emails);
    expect(asStudent.data).toEqual([]);
    expect((await student.client.rpc("admin_waitlist_by_country")).data).toEqual([]);
  });
});
