import { expect, test } from "@playwright/test";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M8.7-F1…F3: "Pick for me", the Plan page and the dashboard's "Today's plan" card, against the
// real database functions (pick_next, assign_my_study_plan, get_my_study_plan).

let user: TestUser | undefined;
test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

async function signIn(context: import("@playwright/test").BrowserContext, baseURL: string) {
  user = await createTestUser("Pia Planner", "user", { test_type: "academic", target_band: 7, timezone: "UTC" });
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
  return user;
}

test("dashboard invitation → Plan page → get a plan → today's checklist → start a new plan", async ({ page, context, baseURL }, info) => {
  await signIn(context, baseURL!);

  await page.goto("/app");
  const invite = page.getByTestId("plan-invite");
  await expect(invite).toContainText("Follow a study plan");
  await invite.getByRole("link", { name: /Get my plan/ }).click();
  await expect(page).toHaveURL(/\/app\/plan$/);
  if (!info.project.name.match(/mobile|ios/)) {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Plan" })).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Get my study plan" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your study plan");
  await expect(page.getByTestId("plan-day")).toContainText(/^Day 1 of \d+/);
  const items = page.getByTestId("plan-item");
  expect(await items.count()).toBeGreaterThan(0);
  // Every item either has Start (content exists) or says there's nothing yet; none is done.
  for (const item of await items.all()) {
    const start = item.getByRole("link", { name: /^Start/ });
    if (await start.count()) await expect(start).toHaveAttribute("href", /^\/app\//);
    else await expect(item).toContainText("Nothing to practise here yet");
  }
  await expect(page.getByTestId("plan-progress")).toContainText(/^0 of \d+ plan tasks completed · 0%$/);
  // The plan never shows its name or the other plans.
  for (const name of ["Balanced", "Steady", "Exam week", "Full coverage", "focus"]) await expect(page.getByRole("main")).not.toContainText(name);

  // Reload: the same picks (fixed for the day).
  const before = await items.allTextContents();
  await page.reload();
  expect(await page.getByTestId("plan-item").allTextContents()).toEqual(before);

  // Start a new plan: asks first.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Start a new plan" }).click();
  await expect(page.getByText("You have a new study plan.")).toBeVisible();
  await expect(page.getByTestId("plan-day")).toContainText(/^Day 1 of \d+/);

  // The dashboard now shows today's plan.
  await page.goto("/app");
  await expect(page.getByTestId("plan-card")).toContainText(/Day 1 of \d+ · \d+ left today · 0% of the plan/);
  await expect(page.getByTestId("plan-invite")).toHaveCount(0);
});

test("Pick for me opens a test the student hasn't done; all done → still a test", async ({ page, context, baseURL }) => {
  const me = await signIn(context, baseURL!);
  const admin = adminClient();
  const { data: tests } = await admin.from("reading_tests").select("id, title").eq("status", "published").eq("test_type", "academic").eq("min_plan", "free");
  expect(tests?.length).toBeGreaterThan(0);
  const ids = tests!.map((t) => t.id);

  await page.goto("/app/reading");
  const pick = page.getByTestId("pick-for-me");
  await expect(pick).toContainText("Pick for me");
  await pick.click();
  await expect(page).toHaveURL(/\/app\/reading\/[0-9a-f-]{36}$/);
  const first = page.url().split("/").pop()!;
  expect(ids).toContain(first);

  // Every academic test done: it still opens one (the one done longest ago).
  await admin.from("test_attempts").insert(ids.map((id) => ({ user_id: me.id, module: "reading" as const, test_id: id, raw_score: 30, band: 7 })));
  await page.goto("/app/pick/reading_test");
  await expect(page).toHaveURL(/\/app\/reading\/[0-9a-f-]{36}$/);
  expect(ids).toContain(page.url().split("/").pop()!);

  // An unknown kind goes back to the dashboard.
  await page.goto("/app/pick/not_a_kind");
  await expect(page).toHaveURL(/\/app$/);
});
