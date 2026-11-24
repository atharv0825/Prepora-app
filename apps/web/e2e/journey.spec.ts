import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M2-I1: the M2 journey end to end, as one visitor takes it, against local Supabase.
//
//   India (Wave 1):  landing → "Start free" → /signup (gate open) → sign in → /app → onboarding
//                    (3 steps) → personalised home (target band, exam countdown, modules)
//   Vietnam (Wave 2): landing → "Start free" → /waitlist (gate closed) → joins the waitlist,
//                    stored with the faked country and source "signup_gate"
//
// The country comes from a faked Cloudflare CF-IPCountry header (what the Worker receives in
// production). Google's consent screen can't be automated, so "Continue with Google" is
// replaced by a real Supabase session for a brand-new user (support/local-supabase.ts); the rest
// is the real app. The OAuth callback itself is covered by unit tests (auth, M2-B3).

function plusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("M2 journey", () => {
  test("a visitor from India signs up, onboards and lands on a personalised home", async ({ page, context, baseURL }) => {
    // Seven pages and a save in one test: give it 3× the default timeout on slow runners.
    test.slow();
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "IN" });

    // Landing → sign-up: India is in Wave 1, so the gate lets them through.
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "Start free" }).click();
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();

    // "Continue with Google" → a new account with a fresh profile (no onboarding answers yet).
    let user: TestUser | undefined;
    try {
      user = await createTestUser("Kavya Iyer");
      await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));

      // The callback sends new users to /app, which sends them to onboarding.
      await page.goto("/app");
      await expect(page).toHaveURL(/\/app\/onboarding$/);

      await expect(page.getByText("Step 1 of 3")).toBeVisible();
      await page.getByRole("radio", { name: /academic/i }).check();
      await page.getByRole("button", { name: /continue/i }).click();

      await expect(page.getByText("Step 2 of 3")).toBeVisible();
      await page.getByText("7.5", { exact: true }).click();
      await page.getByRole("button", { name: /continue/i }).click();

      await expect(page.getByText("Step 3 of 3")).toBeVisible();
      const date = page.getByLabel("Exam date");
      const today = await date.getAttribute("min"); // the browser's today
      await date.fill(plusDays(today!, 45));
      await page.getByRole("button", { name: /finish/i }).click();

      // Personalised home.
      await expect(page).toHaveURL(/\/app$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/, Kavya$/);
      const goal = page.getByRole("region", { name: "Your goal" });
      await expect(goal).toContainText("7.5");
      await expect(goal).toContainText("Academic");
      await expect(goal).toContainText("45 days to go");
      // The sign-up grant (M3-B4), in the home card and the header chip (M3-F1).
      await expect(page.getByRole("region", { name: "AI credits" })).toContainText("18 credits");
      await expect(page.getByRole("banner").getByRole("link", { name: /credits and usage/i })).toHaveText("18");
      await expect(page.getByRole("region", { name: "Practise" }).getByRole("listitem")).toHaveCount(4);

      // Signed in now: the sign-up page sends them home instead.
      await page.goto("/signup");
      await expect(page).toHaveURL(/\/app$/);
    } finally {
      await deleteTestUser(user);
    }
  });

  test("a visitor from Vietnam gets the waitlist and joins it", async ({ page }, testInfo) => {
    await page.setExtraHTTPHeaders({ "CF-IPCountry": "VN" });
    const email = `e2e-journey-${testInfo.project.name}-${Date.now()}@example.com`;

    try {
      // Landing → "Start free" → the gate sends them to the waitlist (Vietnam is Wave 2).
      await page.goto("/");
      await page.getByRole("banner").getByRole("link", { name: "Start free" }).click();
      await expect(page).toHaveURL(/\/waitlist$/);
      await expect(page.getByRole("heading", { name: /not in your country yet/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /continue with google/i })).toHaveCount(0);

      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: /join the waitlist/i }).click();
      await expect(page.getByText("You're on the list.")).toBeVisible();

      // Stored with the country from the header and where they joined from.
      const { data } = await adminClient().from("waitlist").select("country_code, source").eq("email", email).single();
      expect(data).toEqual({ country_code: "VN", source: "signup_gate" });
    } finally {
      await adminClient().from("waitlist").delete().eq("email", email);
    }
  });
});
