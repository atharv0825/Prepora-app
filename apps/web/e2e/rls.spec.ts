import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M1-I1: Row Level Security through the real API (PostgREST), with real user sessions: the same
// requests a browser could send with the public key. Complements the pgTAP tests (M1-C1).
// No browser needed, so it runs once (desktop project only).

test.describe("profiles RLS", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let a: TestUser;
  let b: TestUser;

  test.beforeAll(async () => {
    [a, b] = await Promise.all([createTestUser("User A"), createTestUser("User B")]);
  });

  test.afterAll(async () => {
    await Promise.all([deleteTestUser(a), deleteTestUser(b)]);
  });

  test("user A can't read user B's profile", async () => {
    const { data, error } = await a.client.from("profiles").select("id, full_name").eq("id", b.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  test("user A sees exactly one profile: their own", async () => {
    const { data, error } = await a.client.from("profiles").select("id, full_name");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: a.id, full_name: "User A" }]);
  });

  test("user A can't change user B's profile", async () => {
    const { data, error } = await a.client.from("profiles").update({ full_name: "Hacked" }).eq("id", b.id).select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const { data: still } = await b.client.from("profiles").select("full_name").eq("id", b.id).single();
    expect(still?.full_name).toBe("User B");
  });

  test("user A can't make themselves admin", async () => {
    const { error } = await a.client.from("profiles").update({ role: "admin" }).eq("id", a.id);
    expect(error?.code).toBe("42501");
  });
});
