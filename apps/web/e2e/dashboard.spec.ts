import { expect, test } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

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
    // M8.6: "Start practising" goes to the recommended module; the header pills (wide screens) mark Dashboard.
    await expect(page.getByRole("link", { name: "Start practising" })).toHaveAttribute("href", "/app/reading");
    if (!test.info().project.name.match(/mobile|ios/)) {
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      await expect(nav.getByRole("link", { name: "Writing" })).toHaveAttribute("href", "/app/writing");
    }

    const goal = page.getByRole("region", { name: "Your goal" });
    await expect(goal).toContainText("6.5");
    await expect(goal).toContainText("General Training");
    await expect(goal).toContainText("30 days to go");

    // M8.6: no credits card on home any more; the balance is the header chip.
    await expect(page.getByRole("region", { name: "AI credits" })).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: /credits and usage/i })).toHaveText("18");

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

  test("practice streak: none yet, then today and yesterday make 2, on the dashboard and the profile", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!, { ...ONBOARDED, timezone: "UTC" });
    await page.goto("/app");
    const streak = page.getByRole("region", { name: "Practice streak" });
    await expect(streak.getByTestId("streak-current")).toHaveText("0");
    await expect(streak).toContainText("Finish any practice today to start your streak.");
    await expect(streak.getByRole("listitem")).toHaveCount(7);
    await expect(streak.getByRole("listitem", { name: "Today: no practice" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Band by module" })).toContainText("Finish a test to see your estimated band");
    await expect(page.getByRole("region", { name: "Practice mix" }).getByTestId("practice-total")).toHaveText("0");

    // Two graded Reading tests: yesterday and today (noon UTC, so the dates don't depend on the hour).
    const noon = (daysAgo: number) => `${inDays(-daysAgo)}T12:00:00Z`;
    const at = (daysAgo: number) => (daysAgo === 0 ? new Date().toISOString() : noon(daysAgo));
    const { error } = await adminClient().from("test_attempts").insert(
      [1, 0].map((d) => ({ user_id: user!.id, module: "reading" as const, test_id: crypto.randomUUID(), raw_score: 30, band: 7, created_at: at(d) })),
    );
    expect(error).toBeNull();

    await page.reload();
    await expect(streak.getByTestId("streak-current")).toHaveText("2");
    await expect(streak).toContainText("days in a row");
    await expect(streak).toContainText("Best: 2 days");
    await expect(streak.getByRole("listitem", { name: "Today: practised" })).toBeVisible();
    await expect(streak.getByRole("listitem", { name: /: practised$/ })).toHaveCount(2);

    // M8.6: the chart cards count the same two tests (Reading, band 7 each).
    const bands = page.getByRole("region", { name: "Band by module" });
    await expect(bands.getByTestId("estimated-band")).toHaveText("7.0");
    await expect(bands).toContainText("from 1 of 4 modules");
    await expect(bands.getByRole("list", { name: "Recent band by module" }).getByRole("listitem")).toHaveText([/Reading\s*7\.0/, /Listening\s*—/, /Writing\s*—/, /Speaking\s*—/]);
    const mix = page.getByRole("region", { name: "Practice mix" });
    await expect(mix.getByTestId("practice-total")).toHaveText("2");
    await expect(mix.getByRole("listitem").first()).toContainText("2/2");
    const week = page.getByRole("region", { name: "This week" });
    await expect(week.getByTestId("week-count")).toHaveText("2");
    await expect(week).toContainText("This week: 2 practices");
    await expect(week.getByRole("listitem", { name: /^Today: 1 practice, average band 7\.0$/ })).toHaveCount(1);

    // M8.5-F2: the profile shows the same streak, the all-time total and the 12-week calendar.
    await page.goto("/app/profile");
    const profile = page.getByRole("region", { name: "Practice streak" });
    await expect(profile.getByTestId("profile-streak-current")).toHaveText("2");
    await expect(profile.getByTestId("profile-streak-best")).toHaveText("2");
    await expect(profile.getByTestId("profile-streak-total")).toHaveText("2");
    await expect(profile).toContainText("2 practice days");
    const calendar = profile.getByRole("list", { name: "Practice in the last 12 weeks" });
    await expect(calendar.getByRole("listitem", { name: /: (practised|no practice)$/ })).toHaveCount(84);
    await expect(calendar.getByRole("listitem", { name: /^Today, .*: practised$/ })).toHaveCount(1);
    await expect(calendar.getByRole("listitem", { name: /: practised$/ })).toHaveCount(2);
  });
});
