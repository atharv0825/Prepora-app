import { expect, test, type Page } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M3-I1: credits end to end through a real Edge Function. credits-test (supabase/functions) is a
// dummy AI action that spends 4 credits through withCredits, like every AI feature from M6 on;
// { fail: true } makes its "AI call" fail, so withCredits refunds.
//
// Needs the local Edge Functions: in CI `supabase start` runs the edge runtime (e2e.yml); on a
// laptop run `supabase functions serve` next to `supabase start`. Without them these tests are
// skipped locally and fail in CI.

const { url, publishableKey } = localSupabase();
const FN = `${url}/functions/v1/credits-test`;

async function functionsUp(): Promise<boolean> {
  try {
    const res = await fetch(`${url}/functions/v1/health`, { signal: AbortSignal.timeout(5_000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function callTest(user: TestUser | null, body: Record<string, unknown> = {}) {
  const res = await fetch(FN, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
      ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function balance(user: TestUser): Promise<number> {
  const { data } = await user.client.rpc("get_my_credits");
  return (data as { balance: number }).balance;
}

test.beforeAll(async () => {
  const up = await functionsUp();
  if (!up && process.env.CI) throw new Error("Edge Functions are not running (supabase start must include edge-runtime)");
  test.skip(!up, "Edge Functions not running: start them with `supabase functions serve`");
});

test.describe("credits-test Edge Function (API)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let user: TestUser;
  test.beforeEach(async () => {
    user = await createTestUser("Credits Tester");
  });
  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  test("spends 4 credits; a failed AI call refunds them; usage is logged", async () => {
    const ok = await callTest(user);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, action_key: "writing_t2", credits: 4, balance_after: 14 });
    expect(await balance(user)).toBe(14);

    const failed = await callTest(user, { fail: true });
    expect(failed.status).toBe(500);
    expect(failed.body).toEqual({ error: { code: "internal", message: "The AI call failed. Your credits were refunded." } });
    expect(await balance(user)).toBe(14);

    const db = adminClient();
    const ledger = await db.from("credit_ledger").select("reason, delta, reservation_id").eq("user_id", user.id).order("id");
    const spends = (ledger.data ?? []).filter((e) => e.reason === "spend");
    const refunds = (ledger.data ?? []).filter((e) => e.reason === "refund");
    expect(spends.map((e) => e.delta)).toEqual([-4, -4]);
    expect(refunds.map((e) => e.delta)).toEqual([4]);
    // The refund belongs to the second (failed) spend, not the first.
    expect(refunds[0]?.reservation_id).toBe(spends[1]?.reservation_id);
    expect(refunds[0]?.reservation_id).not.toBe(ok.body.reservation_id);

    const usage = await db.from("ai_usage").select("model, success, credits_charged, reservation_id").eq("user_id", user.id).order("id");
    expect(usage.data?.map((u) => [u.model, u.success, u.credits_charged])).toEqual([
      ["dummy-test", true, 4],
      ["dummy-test", false, 0],
    ]);

    // The refunded spend doesn't count toward today's cap (8): 4 more is allowed, then 429.
    expect((await callTest(user)).status).toBe(200);
    const capped = await callTest(user);
    expect(capped.status).toBe(429);
    expect(capped.body).toMatchObject({
      error: { code: "daily_cap_reached", details: { action_key: "writing_t2", credits: 4, daily_cap: 8, spent_today: 8 } },
    });
    expect(await balance(user)).toBe(10);
  });

  test("needs a session and valid input", async () => {
    expect((await callTest(null)).status).toBe(401);
    const bad = await callTest(user, { fail: "yes" });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ error: { code: "validation_failed" } });
    expect(await balance(user)).toBe(18);
  });
});

test.describe("credits-test in the app", () => {
  let user: TestUser | undefined;
  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  const chip = (page: Page) => page.getByRole("banner").getByRole("link", { name: /credits and usage/i });

  async function confirmRun(page: Page, button: string, confirm: string) {
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("This costs 4 credits");
    await dialog.getByRole("button", { name: confirm, exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  test("the balance updates after a spend; a failed run is refunded", async ({ page, context, baseURL }) => {
    user = await createTestUser("Credits Tester", "user", { ...ONBOARDED, timezone: "UTC" });
    await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));

    await page.goto("/app/credits-test");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Credits test");
    await expect(chip(page)).toHaveText("18");

    await confirmRun(page, "Run test", "Run test");
    await expect(page.getByText("Done: 4 credits spent. 14 left.")).toBeVisible();
    await expect(chip(page)).toHaveText("14");

    await confirmRun(page, "Run failing test", "Run failing test");
    await expect(page.getByText("The AI call failed. Your credits were refunded.")).toBeVisible();
    // Reserved (10) and refunded (14) within the call; the refreshed balance is back to 14.
    await expect(chip(page)).toHaveText("14");

    // A second spend reaches today's cap (the refunded one doesn't count), and the confirm then
    // says so instead of offering the action.
    await confirmRun(page, "Run test", "Run test");
    await expect(chip(page)).toHaveText("10");
    await page.getByRole("button", { name: "Run test", exact: true }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Daily limit reached");
    await page.keyboard.press("Escape");

    await chip(page).click();
    await expect(page.getByRole("region", { name: "History" }).getByRole("listitem")).toHaveText([
      /Writing Task 2 scored.*−4/,
      /Refund: Writing Task 2 scored.*\+4/,
      /Writing Task 2 scored.*−4/,
      /Writing Task 2 scored.*−4/,
      /Monthly credits added.*\+8/,
      /Welcome credits added.*\+10/,
    ]);
    await expect(
      page.getByRole("region", { name: "Balance" }).getByRole("meter", { name: "Used today" }),
    ).toHaveAttribute("aria-valuetext", "8 of 8 daily credits used · 0 left today");
  });
});
