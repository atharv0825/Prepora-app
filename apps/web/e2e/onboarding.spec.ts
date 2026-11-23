import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M2-F2: the 3-step onboarding with a real session against local Supabase. A new user opening
// /app is sent to /app/onboarding, answers, and lands on the home page; the answers are saved.

test.describe("onboarding", () => {
  let user: TestUser;

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestUser("Ravi Kumar");
    await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));
  });

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  async function profile() {
    const { data } = await adminClient()
      .from("profiles")
      .select("test_type, target_band, exam_date, timezone")
      .eq("id", user.id)
      .single();
    return data;
  }

  test("new user: test type → band → skip the date → home", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app\/onboarding$/);
    await expect(page.getByText("Step 1 of 3")).toBeVisible();

    // Can't continue without an answer.
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.locator("#onboarding-error")).toHaveText(/academic or general training/i);

    await page.getByRole("radio", { name: /general training/i }).check();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Step 2 of 3")).toBeVisible();
    await page.getByText("6.5", { exact: true }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Step 3 of 3")).toBeVisible();
    await page.getByRole("button", { name: /skip/i }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1, name: /, ravi$/i })).toBeVisible();
    expect(await profile()).toMatchObject({ test_type: "general", target_band: 6.5, exam_date: null });
    expect((await profile())?.timezone).toBeTruthy();

    // Done: onboarding sends them home now.
    await page.goto("/app/onboarding");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("with an exam date, and Back keeps earlier answers", async ({ page }) => {
    await page.goto("/app/onboarding");
    await page.getByRole("radio", { name: /academic/i }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByText("7.5", { exact: true }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByRole("radio", { name: "7.5" })).toBeChecked();
    await page.getByRole("button", { name: /continue/i }).click();

    const date = page.getByLabel("Exam date");
    const min = await date.getAttribute("min");
    // A month after the browser's "today" (the picker's min), always inside the 2-year range.
    const target = new Date(`${min}T00:00:00Z`);
    target.setUTCDate(target.getUTCDate() + 30);
    const iso = target.toISOString().slice(0, 10);
    await date.fill(iso);
    await page.getByRole("button", { name: /finish/i }).click();

    await expect(page).toHaveURL(/\/app$/);
    expect(await profile()).toMatchObject({ test_type: "academic", target_band: 7.5, exam_date: iso });
  });
});
