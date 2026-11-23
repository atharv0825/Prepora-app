import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@prepora/shared/db";
import { createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M2-A1: the admin users RPCs through the real API (PostgREST), with real sessions: what the
// admin panel calls with the public key. Admins only; everyone else is refused by the database.
// No browser needed, so it runs once (desktop project only).

test.describe("admin users RPCs", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let admin: TestUser;
  let editor: TestUser;
  let student: TestUser;

  test.beforeAll(async () => {
    [admin, editor, student] = await Promise.all([
      createTestUser("Admin Person", "admin"),
      createTestUser("Editor Person", "content_editor"),
      createTestUser("Zara Student", "user", { test_type: "general", target_band: 6.5 }),
    ]);
  });

  test.afterAll(async () => {
    await Promise.all([deleteTestUser(admin), deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an admin can search users and open a profile", async () => {
    const { data, error } = await admin.client.rpc("admin_list_users", { p_search: student.email.toUpperCase() });
    expect(error).toBeNull();
    expect(data?.map((u) => u.email)).toEqual([student.email]);
    expect(data?.[0]).toMatchObject({ full_name: "Zara Student", plan: "free", role: "user", total_count: 1 });

    const byName = await admin.client.rpc("admin_list_users", { p_search: "zara stud", p_plan: "free" });
    expect(byName.data?.map((u) => u.id)).toContain(student.id);

    const { data: detail, error: detailError } = await admin.client.rpc("admin_get_user", { p_id: student.id });
    expect(detailError).toBeNull();
    expect(detail?.[0]).toMatchObject({ email: student.email, test_type: "general", target_band: 6.5 });
  });

  test("students and content editors are refused", async () => {
    for (const user of [student, editor]) {
      const list = await user.client.rpc("admin_list_users", {});
      expect(list.error?.code).toBe("42501");
      const one = await user.client.rpc("admin_get_user", { p_id: admin.id });
      expect(one.error?.code).toBe("42501");
    }
  });

  test("signed-out visitors can't call them at all", async () => {
    const { url, publishableKey } = localSupabase();
    const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("admin_list_users", {});
    expect(data).toBeNull();
    expect(error).not.toBeNull(); // no EXECUTE for anon (permission denied / not found)
  });
});
