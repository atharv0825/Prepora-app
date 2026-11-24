import { expect, test } from "@playwright/test";
import { AdminGrantResult } from "@prepora/shared/api/admin-credits";
import { CreditBalance, PlanLimits, RefundResult } from "@prepora/shared/api/credits";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M3-A1/A2: the admin plans & credits RPCs through the real API (PostgREST) with real sessions,
// as the admin panel calls them with the public key. Admins only; every change is audited.
// Plans and credit costs are shared by every spec running in parallel, so this edits only values
// no other spec reads (Gold's practice sessions, the AI Writing prompt's cost) and restores them.

test.describe("admin plans & credits RPCs", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");
  // One worker for the group: another worker's beforeAll must not read Gold mid-edit and then
  // "restore" the edited value.
  test.describe.configure({ mode: "serial" });

  let admin: TestUser;
  let editor: TestUser;
  let student: TestUser;
  let goldLimits: PlanLimits;
  let promptCredits: number;

  test.beforeAll(async () => {
    [admin, editor, student] = await Promise.all([
      createTestUser("Admin Person", "admin"),
      createTestUser("Editor Person", "content_editor"),
      createTestUser("Zara Student"),
    ]);
    const db = adminClient();
    goldLimits = PlanLimits.parse((await db.from("plans").select("limits").eq("id", "gold").single()).data?.limits);
    promptCredits = (await db.from("credit_costs").select("credits").eq("action_key", "gen_writing_prompt").single()).data!.credits;
  });

  test.afterAll(async () => {
    const db = adminClient();
    await db.from("plans").update({ limits: goldLimits }).eq("id", "gold");
    await db.from("credit_costs").update({ credits: promptCredits }).eq("action_key", "gen_writing_prompt");
    await Promise.all([deleteTestUser(admin), deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("M3-A1: an admin edits a plan and a credit cost; both are audited", async () => {
    const limits = { ...goldLimits, practice_sessions: goldLimits.practice_sessions + 1 };
    const plan = await admin.client.rpc("admin_update_plan", { p_id: "gold", p_limits: limits });
    expect(plan.error).toBeNull();
    expect(plan.data).toMatchObject({ id: "gold", changed: 1 });
    const saved = await admin.client.from("plans").select("limits").eq("id", "gold").single();
    expect(PlanLimits.parse(saved.data?.limits).practice_sessions).toBe(goldLimits.practice_sessions + 1);

    const bad = await admin.client.rpc("admin_update_plan", { p_id: "gold", p_limits: { ...limits, unlimited: true } });
    expect(bad.error?.code).toBe("22023");

    const cost = await admin.client.rpc("admin_update_credit_cost", { p_action_key: "gen_writing_prompt", p_credits: promptCredits + 1 });
    expect(cost.error).toBeNull();
    expect((await admin.client.from("credit_costs").select("credits").eq("action_key", "gen_writing_prompt").single()).data?.credits).toBe(
      promptCredits + 1,
    );

    const audit = await admin.client.rpc("admin_audit_entries", { p_entities: ["plan", "credit_cost"], p_limit: 50 });
    const mine = (audit.data ?? []).filter((a) => a.admin_email === admin.email);
    expect(mine.map((a) => a.action)).toEqual(["credit_cost.update", "plan.update"]);
    expect(mine[1]?.details).toEqual({
      changes: { practice_sessions: { from: goldLimits.practice_sessions, to: goldLimits.practice_sessions + 1 } },
    });
  });

  test("M3-A2: an admin grants and refunds; the student sees it", async () => {
    // A spend the student made (what withCredits does), to refund.
    const spend = await adminClient().rpc("spend_credits", { p_user_id: student.id, p_action_key: "writing_t2" });
    const reservation = (spend.data as { reservation_id: string }).reservation_id;

    const grant = await admin.client.rpc("admin_grant_credits", {
      p_user_id: student.id,
      p_amount: 25,
      p_expires_in_days: 30,
      p_note: "Scoring outage, ticket 42",
    });
    expect(grant.error).toBeNull();
    expect(AdminGrantResult.parse(grant.data).balance_after).toBe(18 - 4 + 25);

    const refund = await admin.client.rpc("admin_refund_credits", {
      p_user_id: student.id,
      p_reservation_id: reservation,
      p_note: "Feedback was empty",
    });
    expect(RefundResult.parse(refund.data)).toMatchObject({ ok: true, status: "refunded", refunded: 4, balance_after: 43 });

    // The admin's view and the student's own are the same numbers.
    const adminView = CreditBalance.parse((await admin.client.rpc("admin_user_credits", { p_user_id: student.id })).data);
    const own = CreditBalance.parse((await student.client.rpc("get_my_credits")).data);
    expect(adminView).toEqual(own);
    expect(own.balance).toBe(43);
    expect(own.buckets.find((b) => b.source === "admin")).toMatchObject({ granted: 25, remaining: 25 });

    const ledger = await admin.client.rpc("admin_user_ledger", { p_user_id: student.id });
    expect(ledger.data?.map((e) => [e.reason, e.delta, e.refunded])).toEqual([
      ["refund", 4, false],
      ["grant", 25, false],
      ["spend", -4, true],
      ["grant", 8, false],
      ["grant", 10, false],
    ]);

    const audit = await admin.client.rpc("admin_audit_entries", { p_entities: ["user"], p_entity_id: student.id });
    expect(audit.data?.map((a) => [a.action, (a.details as { note: string }).note, a.admin_name])).toEqual([
      ["credits.refund", "Feedback was empty", "Admin Person"],
      ["credits.grant", "Scoring outage, ticket 42", "Admin Person"],
    ]);
  });

  test("students and content editors are refused, and can't read the audit log", async () => {
    for (const user of [student, editor]) {
      const grant = await user.client.rpc("admin_grant_credits", { p_user_id: user.id, p_amount: 100, p_expires_in_days: 30, p_note: "free money" });
      expect(grant.error?.code).toBe("42501");
      const cost = await user.client.rpc("admin_update_credit_cost", { p_action_key: "writing_t2", p_credits: 0 });
      expect(cost.error?.code).toBe("42501");
      expect((await user.client.rpc("admin_user_credits", { p_user_id: admin.id })).error?.code).toBe("42501");
      expect((await user.client.rpc("admin_audit_entries", { p_entities: ["user"] })).error?.code).toBe("42501");
      const table = await user.client.from("audit_log").select("id");
      expect(table.error).not.toBeNull();
    }
    expect(CreditBalance.parse((await student.client.rpc("get_my_credits")).data).balance).toBeLessThan(100);
  });
});
