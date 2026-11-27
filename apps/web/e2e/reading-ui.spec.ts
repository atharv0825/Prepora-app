import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";
import { answer, key, pressSubmit } from "./support/reading";

// M4-F1..F4 in the browser against local Supabase and the local grade-test Edge Function, on the
// seeded sample tests (M4-C3): the test list with filters and allowance, the player (timer,
// passages, highlighting, navigator, autosave, mobile tabs), the question types, submission and
// the results page with attempt history. Needs the Edge Functions, like grade-test.spec.ts:
// skipped locally without them, fails in CI.

const { url } = localSupabase();
const ACADEMIC = "5eed0000-0000-4000-8000-00000000000a";
const GENERAL = "5eed0000-0000-4000-8000-00000000000b";

let user: TestUser | undefined;
let goldTest: string;
const goldTitle = `E2E Gold reading ${Math.random().toString(36).slice(2, 8)}`;

test.beforeAll(async () => {
  let up = false;
  try {
    up = (await fetch(`${url}/functions/v1/health`, { signal: AbortSignal.timeout(5_000) })).ok;
  } catch {
    up = false;
  }
  if (!up && process.env.CI) throw new Error("Edge Functions are not running");
  test.skip(!up, "Edge Functions not running: start them with `supabase functions serve`");

  const db = adminClient();
  const { data } = await db.from("reading_tests").insert({ test_type: "academic", title: goldTitle, min_plan: "gold" }).select("id").single();
  goldTest = data!.id;
  // Publishing needs 3 passages and at least one question.
  const { data: p } = await db
    .from("reading_passages")
    .insert([1, 2, 3].map((n) => ({ test_id: goldTest, order_no: n, title: `P${n}`, body: "B" })))
    .select("id, order_no");
  await db.from("reading_questions").insert({
    test_id: goldTest,
    passage_id: p!.find((x) => x.order_no === 1)!.id,
    q_no: 1,
    q_type: "tfng",
    prompt: "Q",
    answer: { value: "true" },
  });
  const { error } = await db.from("reading_tests").update({ status: "published" }).eq("id", goldTest);
  if (error) throw new Error(`publishing the Gold test: ${error.message}`);
});

test.afterAll(async () => {
  if (!goldTest) return;
  await adminClient().from("reading_tests").update({ status: "archived" }).eq("id", goldTest);
  await adminClient().from("reading_tests").delete().eq("id", goldTest);
});

test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

async function signIn(context: BrowserContext, baseURL: string, testType: "academic" | "general" = "academic") {
  user = await createTestUser("Rhea Reader", "user", { ...ONBOARDED, test_type: testType, timezone: "UTC" });
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
  return user;
}

const player = (page: Page) => page.getByTestId("reading-player");

test("M4-F1: list filtered by test type, allowance, locked Gold test; dashboard links here", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "general");
  await page.goto("/app");
  await page.getByRole("region", { name: "Practise" }).getByRole("link", { name: /Reading/ }).click();
  await expect(page).toHaveURL(/\/app\/reading$/);

  // The student's own type first.
  await expect(page.getByRole("button", { name: /^Test type:/ })).toHaveText("General Training");
  const cards = page.getByTestId("reading-test");
  await expect(cards.filter({ hasText: "Sample General Training Test" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "Sample Academic Test" })).toHaveCount(0);
  // Completion bar (the monthly limit moved to each test's start page): nothing completed yet.
  await expect(page.getByTestId("reading-progress")).toContainText(/^0 of \d+ General Training tests? completed · 0%$/);
  await expect(page.getByRole("progressbar", { name: "Reading tests completed" })).toHaveAttribute("aria-valuenow", "0");

  await page.getByRole("button", { name: /^Test type:/ }).click();
  await page.getByRole("menuitemradio", { name: "Academic" }).click();
  await expect(page).toHaveURL(/type=academic/);
  await expect(cards.filter({ hasText: "Sample Academic Test" })).toContainText("Not taken yet");
  const gold = cards.filter({ hasText: goldTitle });
  await expect(gold).toContainText("Gold");
  await expect(gold.getByRole("link", { name: "Unlock with Gold" })).toHaveAttribute("href", "/app/plans");
  // Opening it directly: the upgrade card, not the test.
  await page.goto(`/app/reading/${goldTest}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This test is part of Gold");
  await page.goto("/app/reading/00000000-0000-4000-8000-0000000000ff");
  await expect(page.getByRole("heading", { name: /This page isn.t here/ })).toBeVisible();
});

test("M4-F2..F4: take the Academic sample, all correct → band 9, results and history", async ({ page, context, baseURL, isMobile }) => {
  test.setTimeout(120_000);
  await signIn(context, baseURL!);
  const answers = await key(ACADEMIC);
  await page.goto(`/app/reading/${ACADEMIC}`);
  // Nothing of the answers in the page before submission.
  const html = await page.content();
  for (const leak of ['"answer"', '"explanation"', '"accept"', "Paragraph D lists the steps"]) expect(html).not.toContain(leak);

  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByTestId("timer")).toHaveText(/^(60:00|59:5\d)$/);
  await expect(page.getByRole("tab", { name: /Passage/ })).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Questions" }).getByRole("button")).toHaveCount(20);
  if (isMobile) {
    // Tabs: one pane at a time.
    await expect(page.getByTestId("passage-pane")).toBeVisible();
    await expect(page.getByTestId("questions-pane")).toBeHidden();
    await page.getByRole("button", { name: "questions" }).click();
    await expect(page.getByTestId("passage-pane")).toBeHidden();
    await page.getByRole("button", { name: "passage" }).click();
  } else {
    // Split view: both side by side.
    const [a, b] = [await page.getByTestId("passage-pane").boundingBox(), await page.getByTestId("questions-pane").boundingBox()];
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  }

  // Highlight "beekeeping" in passage 1.
  await page.getByTestId("passage-body").evaluate((el) => {
    const text = el.firstChild!;
    const at = text.textContent!.indexOf("beekeeping");
    const r = document.createRange();
    r.setStart(text, at);
    r.setEnd(text, at + "beekeeping".length);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(r);
  });
  await page.getByRole("button", { name: "Highlight" }).click();
  await expect(page.getByTestId("passage-body").locator("mark")).toHaveText("beekeeping");

  // The groups have their instructions and shared lists.
  if (isMobile) await page.getByRole("button", { name: "questions" }).click();
  await expect(page.getByTestId("questions-pane").getByText("TRUE, FALSE or NOT GIVEN").first()).toBeVisible();

  // Answer half, reload: answers, highlight and clock are kept.
  const nos = [...answers.keys()].sort((x, y) => x - y);
  for (const n of nos.slice(0, 10)) await answer(page, n, answers.get(n)!);
  await page.reload();
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByText("Continued where you left off.")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Passage 1/ })).toContainText(/\d+\/\d+ answered/);
  if (isMobile) await page.getByRole("button", { name: "passage" }).click();
  await page.getByRole("tab", { name: /Passage 1/ }).click();
  await expect(page.getByTestId("passage-body").locator("mark")).toHaveText("beekeeping");
  for (const n of nos.slice(10)) await answer(page, n, answers.get(n)!);
  await expect(page.getByRole("navigation", { name: "Questions" }).getByRole("button", { name: /answered$/ })).toHaveCount(20);

  await pressSubmit(page);
  await expect(page).toHaveURL(/\/app\/reading\/attempts\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByTestId("band")).toHaveText("9.0");
  await expect(page.getByTestId("raw-score")).toHaveText("20 of 20 correct");
  await expect(page.getByRole("region", { name: /^Passage 1: Bees in the city/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Passage 3/ })).toBeVisible();
  await expect(page.getByText("Paragraph D lists the steps").first()).toBeVisible(); // an explanation
  await expect(page.getByRole("region", { name: "Your attempts at this test" }).getByRole("listitem")).toHaveCount(1);
  // The draft is gone.
  expect(await page.evaluate((id) => localStorage.getItem(`prepora:reading:${id}`), ACADEMIC)).toBeNull();

  await page.getByRole("link", { name: "Choose another test" }).click();
  await expect(page.getByTestId("reading-progress")).toContainText(/^1 of \d+ Academic tests? completed · \d+%$/);
  await expect(page.getByTestId("reading-test").filter({ hasText: "Sample Academic Test" })).toContainText("Taken 1 time · best band 9.0");
  await expect(page.getByRole("region", { name: "Your attempts" }).getByRole("link")).toHaveCount(1);
});

test("M4-F2 layout: desktop fills the screen; mobile scrolls with a pinned switch; Previous / Next, Submit at the end on mobile", async ({
  page,
  context,
  baseURL,
  isMobile,
}) => {
  await signIn(context, baseURL!);
  await page.goto(`/app/reading/${ACADEMIC}`);
  // The start screen names the test.
  await expect(page.getByTestId("reading-intro").getByRole("heading", { level: 1 })).toHaveText("Sample Academic Test");
  await page.getByRole("button", { name: "Start the test" }).click();
  // `next dev` floats its "N" badge over the bottom-left corner (not in production builds).
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });

  // During the test: no visible title, the back link stays.
  await expect(page.getByText("Academic Reading", { exact: true })).toBeHidden();
  await expect(player(page).getByRole("link", { name: "Reading tests" })).toHaveAttribute("href", "/app/reading");
  const navigator = page.getByRole("navigation", { name: "Questions" });
  const viewport = page.viewportSize()!;
  const submitTop = player(page).getByRole("button", { name: "Submit answers" });

  if (!isMobile) {
    // Desktop: the page doesn't scroll; the panes scroll inside; the navigator is on screen.
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    const nav = await navigator.boundingBox();
    expect(nav!.y + nav!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.getByTestId("questions-pane").evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect(submitTop).toBeVisible();
  } else {
    // Mobile: a normal scrolling page; no Submit at the top; the switch stays pinned.
    await expect(submitTop).toBeHidden();
    const show = page.getByRole("group", { name: "Show" });
    await page.mouse.wheel(0, 1500);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    const pinned = await show.boundingBox();
    expect(pinned!.y).toBeGreaterThanOrEqual(60); // just under the 64px header
    expect(pinned!.y).toBeLessThan(140);
    // Questions, then back to the passage where it was left.
    const passageAt = await page.evaluate(() => window.scrollY);
    await show.getByRole("button", { name: "questions" }).click();
    await expect(page.getByTestId("questions-pane")).toBeVisible();
    await show.getByRole("button", { name: "passage" }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(passageAt);
    // The navigator stays at the bottom of the screen.
    const nav = await navigator.boundingBox();
    expect(nav!.y + nav!.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  // Next / Previous move through the question numbers.
  await expect(page.getByRole("button", { name: "Previous question" })).toBeDisabled();
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(navigator.getByRole("button", { name: /^Question 1(,|$)/ })).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: "Next question" }).click();
  await expect(navigator.getByRole("button", { name: /^Question 2(,|$)/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("questions-pane").locator('[data-q="2"]')).toBeInViewport();
  await page.getByRole("button", { name: "Previous question" }).click();
  await expect(navigator.getByRole("button", { name: /^Question 1(,|$)/ })).toHaveAttribute("aria-current", "step");
  // The last question, across passages: Next ends (desktop) or becomes Submit (mobile).
  await navigator.getByRole("button", { name: /^Question 20(,|$)/ }).click();
  await expect(page.getByRole("tab", { name: /Passage 3/ })).toHaveAttribute("aria-selected", "true");
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Next question" })).toBeHidden();
    await submitTop.filter({ visible: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Submit with 20 unanswered?");
    await page.getByRole("dialog").getByRole("button", { name: "Keep going" }).click();
  } else {
    await expect(page.getByRole("button", { name: "Next question" })).toBeDisabled();
  }
  await page.screenshot({ path: test.info().outputPath("layout.png") });
});

test("M4-F3/F4: wrong and unanswered answers show the correct answer; confirm before submitting", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!, "general");
  await page.goto(`/app/reading/${GENERAL}`);
  await page.getByRole("button", { name: "Start the test" }).click();
  await answer(page, 1, "false"); // wrong (the key is true)
  await answer(page, 8, "your staff ID card"); // over the word limit
  await expect(page.getByTestId("questions-pane").getByText(/Too long/)).toBeVisible();

  await pressSubmit(page);
  await expect(page.getByRole("dialog")).toContainText("Submit with 12 unanswered?");
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByTestId("raw-score")).toHaveText("0 of 14 correct", { timeout: 20_000 });
  await expect(page.getByTestId("band")).toHaveText("0.0");
  const q1 = page.locator('[data-q="1"]');
  await expect(q1).toHaveAttribute("data-correct", "false");
  await expect(q1).toContainText("Your answer: false");
  await expect(q1).toContainText("Correct answer: true");
  await expect(page.locator('[data-q="8"]')).toContainText("over the word limit");
  await expect(page.locator('[data-q="6"]')).toContainText("also accepted: Facilities team");
  await expect(page.locator('[data-q="14"]')).toContainText("Your answer: —");
});

test("M4-F2: the timer warns, then sends the answers at zero", async ({ page, context, baseURL }) => {
  await signIn(context, baseURL!);
  await page.goto(`/app/reading/${ACADEMIC}`);
  // A draft that started 59:57 ago, with one answer.
  await page.evaluate((id) => {
    localStorage.setItem(`prepora:reading:${id}`, JSON.stringify({ startedAt: Date.now() - (3600 - 4) * 1000, answers: { "1": "true" }, highlights: {} }));
  }, ACADEMIC);
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByTestId("timer")).toHaveAttribute("data-tone", "urgent");
  // No confirm dialog: time's up, the answers go.
  await expect(page).toHaveURL(/\/app\/reading\/attempts\//, { timeout: 20_000 });
  await expect(page.getByTestId("raw-score")).toContainText("of 20 correct");
});

test("M4-F2: a third test this month on Free opens the monthly-limit dialog", async ({ page, context, baseURL }) => {
  const u = await signIn(context, baseURL!);
  for (let i = 0; i < 2; i++) {
    const res = await fetch(`${url}/functions/v1/grade-test`, {
      method: "POST",
      headers: { apikey: localSupabase().publishableKey, authorization: `Bearer ${u.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ module: "reading", test_id: GENERAL, answers: {} }),
    });
    expect(res.status).toBe(200);
  }
  // The start page shows the monthly limit (moved there from the list).
  await page.goto(`/app/reading/${ACADEMIC}`);
  await expect(page.getByTestId("allowance")).toHaveText("2 of 2 used");
  await expect(page.getByText("You've used this month's Reading tests.")).toBeVisible();
  await page.getByRole("button", { name: "Start the test" }).click();
  await answer(page, 1, "true");
  await pressSubmit(page);
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("dialog")).toContainText("Monthly limit reached");
  // Still on the test, answers kept.
  await expect(page).toHaveURL(new RegExp(`/app/reading/${ACADEMIC}$`));
  expect(await page.evaluate((id) => localStorage.getItem(`prepora:reading:${id}`), ACADEMIC)).toContain('"1":"true"');
});
