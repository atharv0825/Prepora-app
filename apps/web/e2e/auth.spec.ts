import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M1-I1: the session gate end to end (middleware M1-F2, pages M1-F1/F3).

test.describe("signed out", () => {
  test("/app redirects to the login page", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("a deep link keeps where the person was going", async ({ page }) => {
    await page.goto("/app/profile");
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fprofile$/);
  });
});

test.describe("signed in", () => {
  let user: TestUser;

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestUser("Asha Rao");
    await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));
  });

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  test("lands on /app with their name, and login sends them back to /app", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: /welcome, asha rao/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu for Asha Rao" })).toBeVisible();

    await page.goto("/login");
    await expect(page).toHaveURL(/\/app$/);
  });

  test("can log out from the account menu", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: "Account menu for Asha Rao" }).click();
    await page.getByRole("menuitem", { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
  });
});
