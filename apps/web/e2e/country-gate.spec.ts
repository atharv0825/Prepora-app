import { expect, test } from "@playwright/test";

// M2-F1: the country gate end to end, faking Cloudflare's CF-IPCountry header (plan M2-I1).
// Uses the seeded country_regions (M2-B1): IN is enabled (Wave 1), VN is not yet (Wave 2).

test.describe("country gate on /signup", () => {
  test("a visitor from Vietnam gets the waitlist instead of sign-up", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "VN" });
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/waitlist$/);
    await expect(page.getByRole("heading", { name: /not in your country yet/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /join the waitlist/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);
  });

  test("an unknown country (XX) gets the waitlist too", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "XX" });
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/waitlist$/);
  });

  test("a visitor from India can sign up", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "IN" });
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("log in stays open everywhere (existing users may be travelling)", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "VN" });
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });
});
