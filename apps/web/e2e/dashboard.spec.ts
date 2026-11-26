import { expect, test } from "@playwright/test";
import { ONBOARDED, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M2-F3: the home dashboard for an onboarded student: greeting, goal card with the exam
// countdown, credits card and the four module tiles (Reading open since M4-F1, Listening since
// the Listening, Writing and Speaking home pages).

function inDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

test.describe("home dashboard", () => {
  let user: TestUser | undefined;

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  async function signIn(context: import("@playwright/test").BrowserContext, baseURL: string, profile: Parameters<typeof createTestUser>[2]) {
    user = await createTestUser("Meera Shah", "user", profile);
    await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
  }

  test("shows the goal, the countdown, credits and the four modules", async ({ page, context, baseURL }) => {
    // UTC time zone, so the test's "today" and the page's agree.
    await signIn(context, baseURL!, { test_type: "general", target_band: 6.5, exam_date: inDays(30), timezone: "UTC" });
    await page.goto("/app");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening), Meera$/);

    const goal = page.getByRole("region", { name: "Your goal" });
    await expect(goal).toContainText("6.5");
    await expect(goal).toContainText("General Training");
    await expect(goal).toContainText("30 days to go");

    const credits = page.getByRole("region", { name: "AI credits" });
    await expect(credits).toContainText("18 credits"); // sign-up grant (M3-B4), shown since M3-F1
    await expect(credits).toContainText("Free plan");

    const modules = page.getByRole("region", { name: "Practise" }).getByRole("listitem");
    await expect(modules).toHaveCount(4);
    // All four modules are open (Speaking since M7).
    for (const [name, href] of [["Reading", "/app/reading"], ["Listening", "/app/listening"], ["Writing", "/app/writing"], ["Speaking", "/app/speaking"]]) {
      const tile = modules.filter({ has: page.getByRole("heading", { name }) });
      await expect(tile.getByRole("link")).toHaveAttribute("href", href);
      await expect(tile).not.toContainText("Coming soon");
    }
  });

  test("no exam date: 'Not booked yet'; no time zone: 'Welcome back'", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!, ONBOARDED);
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome back, Meera");
    const goal = page.getByRole("region", { name: "Your goal" });
    await expect(goal).toContainText("7.0");
    await expect(goal).toContainText("Academic");
    await expect(goal).toContainText("Not booked yet");
  });
});
