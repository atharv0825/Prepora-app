import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M3-F1…F3 in the browser against local Supabase: the header chip, "Credits & usage", the home
// credits card, the plans placeholder, and (on /design, with sample data, until an AI action
// exists in M6) the cost confirm and the credit error dialogs.

test.describe("credits UI (signed in)", () => {
  let user: TestUser | undefined;

  test.afterEach(async () => {
    await deleteTestUser(user);
  });

  async function signIn(context: BrowserContext, baseURL: string) {
    // UTC: dates on the page and in the test agree. Sign-up grant: 10 welcome + 8 monthly.
    user = await createTestUser("Ravi Kumar", "user", { ...ONBOARDED, timezone: "UTC" });
    await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
    return user;
  }

  const chip = (page: Page) => page.getByRole("banner").getByRole("link", { name: /credits and usage/i });

  test("a new user sees 18 credits in the header and on Credits & usage", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!);
    await page.goto("/app");

    await expect(chip(page)).toHaveText("18");
    await expect(chip(page)).toHaveAccessibleName("18 credits. Credits and usage");
    // The home dashboard no longer has a credits card (M8.6): the chip and Credits & usage show it.

    await chip(page).click();
    await expect(page).toHaveURL(/\/app\/credits$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Credits & usage");

    const balance = page.getByRole("region", { name: "Balance" });
    await expect(balance).toContainText("18");
    await expect(balance.getByRole("meter", { name: "Used today" })).toHaveAttribute("aria-valuetext", "0 of 8 daily credits used · 8 left today");

    const buckets = page.getByRole("region", { name: "Your credits" }).getByRole("listitem");
    await expect(buckets).toHaveCount(2);
    // Soonest expiry first: monthly (a month from now), then welcome (never).
    await expect(buckets.nth(0)).toContainText("Monthly credits");
    await expect(buckets.nth(0)).toContainText(/Expires (on|in)/);
    await expect(buckets.nth(0)).toContainText("8 of 8");
    await expect(buckets.nth(1)).toContainText("Welcome credits");
    await expect(buckets.nth(1)).toContainText("Never expires");

    const allowances = page.getByRole("region", { name: "This month's tests" });
    await expect(allowances.getByRole("meter", { name: "Reading tests" })).toHaveAttribute("aria-valuetext", "0 of 2 used");
    await expect(allowances.getByRole("listitem").filter({ hasText: "Full mock tests" })).toContainText("Not in your plan");

    const history = page.getByRole("region", { name: "History" }).getByRole("listitem");
    await expect(history).toHaveCount(2);
    await expect(history.nth(0)).toContainText("Monthly credits added");
    await expect(history.nth(0)).toContainText("+8");
    await expect(history.nth(1)).toContainText("Welcome credits added");
    await expect(history.nth(1)).toContainText("+10");
  });

  test("spends, refunds and allowances show up after they happen", async ({ page, context, baseURL }) => {
    const u = await signIn(context, baseURL!);
    // What an AI Edge Function does through withCredits (M3-B6): spend; on failure, refund.
    const db = adminClient();
    const first = await db.rpc("spend_credits", { p_user_id: u.id, p_action_key: "writing_t2" });
    const reservation = (first.data as { reservation_id: string }).reservation_id;
    await db.rpc("refund_credits", { p_reservation_id: reservation });
    // OCR is not in the Free plan: refused, so nothing changes.
    await db.rpc("spend_credits", { p_user_id: u.id, p_action_key: "ocr" });
    await db.rpc("spend_credits", { p_user_id: u.id, p_action_key: "speaking_p2" });
    await db.rpc("use_allowance", { p_user_id: u.id, p_type: "reading_tests" });

    await page.goto("/app/credits");
    await expect(chip(page)).toHaveText("14");
    await expect(page.getByRole("region", { name: "Balance" }).getByRole("meter", { name: "Used today" })).toHaveAttribute(
      "aria-valuetext",
      "4 of 8 daily credits used · 4 left today",
    );
    // Monthly expires first, so the 4 credits came from it.
    await expect(page.getByRole("region", { name: "Your credits" }).getByRole("listitem").nth(0)).toContainText("4 of 8");
    await expect(page.getByRole("meter", { name: "Reading tests" })).toHaveAttribute("aria-valuetext", "1 of 2 used");

    const history = page.getByRole("region", { name: "History" }).getByRole("listitem");
    await expect(history).toHaveText([
      /Speaking Part 2 scored.*−4/,
      /Refund: Writing Task 2 scored.*\+4/,
      /Writing Task 2 scored.*−4/,
      /Monthly credits added.*\+8/,
      /Welcome credits added.*\+10/,
    ]);
  });

  test("the account menu links to Credits & usage; See plans opens the placeholder", async ({ page, context, baseURL }) => {
    await signIn(context, baseURL!);
    await page.goto("/app/profile");
    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "Credits & usage" }).click();
    await expect(page).toHaveURL(/\/app\/credits$/);

    await page.getByRole("region", { name: "Balance" }).getByRole("link", { name: "See plans" }).click();
    await expect(page).toHaveURL(/\/app\/plans$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plans & top-ups");
    const plans = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(plans).toHaveText(["Free", "Gold", "Platinum", "Top-up credits"]);
    await expect(page.getByText("Your plan")).toHaveCount(1);
    await expect(page.getByRole("main")).toContainText("100 AI credits a month");
  });
});

test.describe("credit dialogs (/design, sample data)", () => {
  // Sample: 5 credits, 4 of today's 8 used (credits-demos.tsx).
  test.beforeEach(async ({ page }) => {
    await page.goto("/design");
  });

  test("cost confirm: enough credits shows the balance after and runs on confirm", async ({ page }) => {
    await page.getByRole("button", { name: "Score Task 2 (4 credits)" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("This costs 4 credits");
    await expect(dialog).toContainText("Writing Task 2 scored");
    await expect(dialog).toContainText(/Your balance\s*5/);
    await expect(dialog).toContainText(/After this\s*1/);
    await dialog.getByRole("button", { name: "Score my essay" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Scoring started")).toBeVisible();
  });

  test("cost confirm: not enough credits offers top-up instead of confirm", async ({ page }) => {
    await page.getByRole("button", { name: "Speaking Part 3 (6 credits)" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("This costs 6 credits");
    await expect(dialog.getByRole("alert")).toContainText("Not enough credits");
    await expect(dialog.getByRole("alert")).toContainText("This costs 6 credits. You have 5.");
    await expect(dialog.getByRole("button", { name: "Start Part 3" })).toHaveCount(0);
    await expect(dialog.getByRole("link", { name: "Top up credits" })).toHaveAttribute("href", "/app/plans#top-up");
    await expect(dialog.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/app/plans");
  });

  test("cost confirm: over the daily limit says so", async ({ page }) => {
    await page.getByRole("button", { name: "Speaking Part 1 (5 credits)" }).click();
    const alert = page.getByRole("dialog").getByRole("alert");
    await expect(alert).toContainText("Daily limit reached");
    await expect(alert).toContainText("You've used 4 of today's 8 credits, and this costs 5.");
    await page.getByRole("dialog").getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("each API credit error opens its dialog", async ({ page }) => {
    const cases = [
      { button: "Out of credits", title: "Not enough credits", links: ["See plans", "Top up credits"] },
      { button: "Daily limit", title: "Daily limit reached", links: ["See plans"] },
      { button: "Allowance used", title: "Monthly limit reached", links: ["See plans"] },
      { button: "Not in plan", title: "Not in your plan", links: ["See plans"] },
    ];
    for (const c of cases) {
      await page.getByRole("button", { name: c.button, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading")).toHaveText(c.title);
      await expect(dialog.getByRole("link")).toHaveText(c.links);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }
    await page.getByRole("button", { name: "Allowance used", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("You've used 2 of 2 reading tests this month.");
  });
});
