import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { MOCK_TASK2_ESSAY } from "@prepora/shared/mocks/writing";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M6-F1..F4 in the browser:
//   * F1: the dashboard tile → the task list (Task 1 by test type, Task 2 for both); the editor with
//     live word count, the 20/40-minute timer (starts with the first word, never submits by
//     itself) and autosave on this device.
//   * F3: "Get my band score" → credit confirm (with an under-length warning) → progress → the
//     real score-writing → the saved feedback page. Needs functions with an AI: E2E_AI=1 (CI points
//     DEEPSEEK_API_URL at the ai-stub function, so no AI is called there, M6-I1). Stored feedback
//     pages are also checked with rows written as score-writing writes them: Gold gets the full
//     feedback, Free the summary with locked sections, others the 404 page.
//   * F2: photo upload is locked on Free; on Gold a photo is prepared, uploaded and read by the
//     real ocr-writing into the editor; the desktop QR code opens the photo flow on a phone.
//   * F4: the history list and the band trend.

const BASE = "http://localhost:3200"; // playwright.config.ts
const aiReady = process.env.E2E_AI === "1";
const NEEDS_AI = "needs functions with an AI (E2E_AI=1: the ai-stub in CI, or a DeepSeek key locally)";
const stamp = Math.random().toString(36).slice(2, 8);
const tasks = { academic: "", general: "", essay: "" };
let users: TestUser[] = [];

test.beforeAll(async () => {
  const db = adminClient();
  const { data, error } = await db
    .from("writing_tasks")
    .insert(
      [
        { task_no: 1, test_type: "academic", title: `E2E chart ${stamp}`, prompt: "The chart below shows rainfall in three cities.\nSummarise the information.", image_url: `${BASE}/logo.png`, status: "published" },
        { task_no: 1, test_type: "general", title: `E2E letter ${stamp}`, prompt: "Write a letter to your neighbour about noise.", status: "published" },
        { task_no: 2, title: `E2E essay ${stamp}`, prompt: "Some people believe that working from home benefits both employees and employers. Discuss both views.", status: "published" },
      ],
      { defaultToNull: false },
    )
    .select("id, title");
  if (error) throw error;
  for (const t of data) {
    if (t.title.startsWith("E2E chart")) tasks.academic = t.id;
    else if (t.title.startsWith("E2E letter")) tasks.general = t.id;
    else tasks.essay = t.id;
  }
});

test.afterAll(async () => {
  const db = adminClient();
  const ids = Object.values(tasks).filter(Boolean);
  if (!ids.length) return;
  await db.from("writing_submissions").delete().in("task_id", ids);
  await db.from("writing_tasks").update({ status: "archived" }).in("id", ids);
  await db.from("writing_tasks").delete().in("id", ids);
});

test.afterEach(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u)));
  users = [];
});

async function student(context: BrowserContext, baseURL: string, name: string, plan: "free" | "gold" = "free") {
  const u = await createTestUser(name, "user", { ...ONBOARDED, timezone: "UTC" });
  users.push(u);
  if (plan !== "free") await adminClient().from("profiles").update({ plan }).eq("id", u.id);
  await context.addCookies(u.cookies.map((c) => ({ ...c, url: baseURL })));
  return u;
}

/** A row as score-writing writes it (service role). */
async function seedSubmission(userId: string, taskId: string, opts: { band: number; full: boolean; createdAt?: string }) {
  const corrections = [
    { original: "alot", suggestion: "a lot", category: "spelling", explanation: "\"A lot\" is always two words." },
    { original: "peoples", suggestion: "people", category: "grammar", explanation: "\"People\" is already plural." },
    { original: "more harder", suggestion: "harder", category: "grammar", explanation: "Use one comparative." },
  ];
  const summary = "A clear answer with a consistent position, held back by grammar slips.";
  const feedback = opts.full
    ? { detail: "full", summary, corrections, strengths: ["Your position is clear throughout."], improvements: ["Check subject–verb agreement."], model_answer: "Remote working has become widespread, and opinions differ…" }
    : { detail: "summary", summary, corrections_count: corrections.length };
  const scores = { ta: opts.band, cc: opts.band, lr: opts.band, gra: opts.band };
  const { data, error } = await adminClient()
    .from("writing_submissions")
    .insert({
      user_id: userId,
      task_id: taskId,
      input_mode: "typed",
      text: "Nowadays alot of companies let staff work from home, and many peoples like it. It is more harder to manage teams.",
      word_count: 262,
      scores,
      band: opts.band,
      feedback,
      prompt_version: "t2-v1",
      ...(opts.createdAt ? { created_at: opts.createdAt } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function typeAnswer(page: Page, text: string) {
  const box = page.getByTestId("answer");
  await box.click();
  await box.fill(text);
}

test("F1: dashboard → task list by test type; costs shown", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Wren Writer");
  await page.goto("/app");
  await page.getByRole("region", { name: "Practise" }).getByRole("link", { name: /Writing/ }).click();
  await expect(page).toHaveURL(/\/app\/writing$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Writing");
  await expect(page.getByText(/Scoring costs 4 credits/)).toBeVisible();

  // Academic (the profile's test type): the chart task and the essay, not the letter.
  const cards = page.getByTestId("writing-task");
  await expect(cards.filter({ hasText: `E2E chart ${stamp}` })).toContainText("Task 1 · Academic report");
  await expect(cards.filter({ hasText: `E2E essay ${stamp}` })).toContainText("Not written yet");
  await expect(cards.filter({ hasText: `E2E letter ${stamp}` })).toHaveCount(0);
  await page.getByRole("link", { name: "General Training" }).click();
  await expect(cards.filter({ hasText: `E2E letter ${stamp}` })).toBeVisible();
  await expect(cards.filter({ hasText: `E2E chart ${stamp}` })).toHaveCount(0);
  await expect(cards.filter({ hasText: `E2E essay ${stamp}` })).toBeVisible();
  await expect(page.getByRole("region", { name: "Your Writing" })).toContainText("No scored answers yet");
});

test("F1: editor — word count, timer from the first word, autosave, chart image", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Ed Editor");
  await page.goto(`/app/writing/${tasks.essay}`);
  await expect(page.getByTestId("task-prompt")).toContainText("Discuss both views");
  await expect(page.getByTestId("timer")).toHaveText("40:00");
  await expect(page.getByTestId("timer")).toHaveAttribute("aria-label", "Timer not started");
  await expect(page.getByTestId("word-count")).toHaveText("0 words / 250+");
  await expect(page.getByRole("button", { name: "Get my band score" })).toBeDisabled();

  await typeAnswer(page, "Remote work has clear benefits for staff and companies alike.");
  await expect(page.getByTestId("word-count")).toHaveText("10 words / 250+");
  await expect(page.getByTestId("timer")).toHaveText(/^(39:5\d|40:00)$/);
  await expect(page.getByTestId("timer")).not.toHaveAttribute("aria-label", "Timer not started");
  await expect(page.getByTestId("answer")).not.toHaveAttribute("spellcheck", "true");

  // Autosaved on this device: a reload brings it back.
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), `prepora:writing:${tasks.essay}`)).toContain("Remote work");
  await page.reload();
  await expect(page.getByTestId("answer")).toHaveValue("Remote work has clear benefits for staff and companies alike.");
  await expect(page.getByText("Your draft from this device is back.")).toBeVisible();

  // Task 1 Academic: the chart and the 20-minute clock.
  await page.goto(`/app/writing/${tasks.academic}`);
  await expect(page.getByRole("img", { name: /chart, graph, table or diagram/ })).toBeVisible();
  await expect(page.getByTestId("timer")).toHaveText("20:00");
  await page.screenshot({ path: test.info().outputPath("editor-task1.png"), fullPage: true });
});

test("F1: over time — the clock counts up and nothing is sent by itself", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Otto Overtime");
  await page.goto(`/app/writing/${tasks.general}`);
  await page.evaluate(
    ([k, t]) => localStorage.setItem(k, JSON.stringify({ startedAt: t, text: "Dear neighbour, I am writing about the noise.", mode: "typed", photoPaths: [] })),
    [`prepora:writing:${tasks.general}`, Date.now() - 21 * 60_000 - 5_000] as const,
  );
  await page.reload();
  await expect(page.getByTestId("timer")).toHaveText(/^\+01:\d\d$/);
  await expect(page.getByText(/Time's up: in the exam you'd stop here/)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("scoring-progress")).toHaveCount(0);
  await expect(page.getByTestId("answer")).toHaveValue(/Dear neighbour/);
});

test("F3: Gold — confirm 4 credits, progress, then the saved full feedback with inline corrections", async ({ page, context, baseURL }) => {
  test.skip(!aiReady, NEEDS_AI);
  test.setTimeout(180_000);
  await student(context, baseURL!, "Gil Gold", "gold");
  await page.goto(`/app/writing/${tasks.essay}`);
  await typeAnswer(page, MOCK_TASK2_ESSAY);
  await page.getByRole("button", { name: "Get my band score" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("This costs 4 credits");
  await expect(dialog).toContainText("Band per criterion, corrections and a model answer");
  await dialog.getByRole("button", { name: "Score my answer" }).click();
  await expect(page.getByTestId("scoring-progress")).toBeVisible();

  // score-writing saved it: the feedback opens on its own page.
  await expect(page).toHaveURL(/\/app\/writing\/submissions\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  const feedback = page.getByTestId("writing-feedback");
  await expect(feedback).toBeVisible();
  await expect(page.getByTestId("band")).toHaveText(/^[4-7]\.[05]$/);
  await expect(page.getByTestId("criterion-ta")).toContainText("Task Response");
  await expect(page.getByTestId("criterion-gra")).toContainText("Grammatical Range and Accuracy");
  // Each highlighted mistake links to its numbered correction.
  // Each highlight links to its numbered correction (in text order, so not necessarily 1 first).
  const marks = page.getByTestId("answer-text").getByRole("link");
  expect(await marks.count()).toBeGreaterThanOrEqual(2);
  await expect(marks.first()).toHaveAttribute("href", /^#correction-\d+$/);
  await expect(page.getByTestId("answer-text").locator('a[href="#correction-1"]')).toHaveCount(1);
  await expect(page.getByTestId("correction").first()).toBeVisible();
  await expect(page.getByTestId("strengths")).toBeVisible();
  await page.getByTestId("model-answer").getByText("Model answer", { exact: true }).click();
  await expect(page.getByTestId("model-answer")).toContainText("Remote working");
  // The draft is cleared once scored.
  expect(await page.evaluate((k) => localStorage.getItem(k), `prepora:writing:${tasks.essay}`)).toBeNull();
  await page.screenshot({ path: test.info().outputPath("feedback-full-mock.png"), fullPage: true });
});

test("F3: Free — under-length warning, then the saved summary with locked sections", async ({ page, context, baseURL }) => {
  test.skip(!aiReady, NEEDS_AI);
  test.setTimeout(180_000);
  await student(context, baseURL!, "Fay Free");
  await page.goto(`/app/writing/${tasks.essay}`);
  await typeAnswer(page, "Working from home is good because peoples save time. But alot of managers dont like it.");
  await page.getByRole("button", { name: "Get my band score" }).click();
  await expect(page.getByRole("dialog")).toContainText("under the 250-word minimum");
  await page.getByRole("dialog").getByRole("button", { name: "Score my answer" }).click();
  await expect(page).toHaveURL(/\/app\/writing\/submissions\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect(page.getByTestId("word-count")).toContainText("under the 250-word minimum");
  const locked = page.getByTestId("locked-feedback");
  await expect(locked).toContainText(/\d+ corrections? found/);
  await expect(locked.getByRole("link", { name: "Upgrade to Gold" })).toHaveAttribute("href", "/app/plans");
  await expect(page.getByTestId("correction")).toHaveCount(0);
  await expect(page.getByTestId("model-answer")).toHaveCount(0);
});

test("F3: stored feedback — Gold full, Free summary, nobody else", async ({ page, context, baseURL }) => {
  const gold = await student(context, baseURL!, "Gail Gold", "gold");
  const goldId = await seedSubmission(gold.id, tasks.essay, { band: 6.5, full: true });
  await page.goto(`/app/writing/submissions/${goldId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E essay ${stamp}`);
  await expect(page.getByTestId("band")).toHaveText("6.5");
  await expect(page.getByTestId("answer-text").getByRole("link")).toHaveText(["alot1", "peoples2", "more harder3"]);
  await page.getByTestId("answer-text").getByRole("link", { name: /peoples/ }).click();
  await expect(page).toHaveURL(/#correction-2$/);
  await expect(page.locator("#correction-2")).toContainText("\"People\" is already plural.");
  await expect(page.getByRole("link", { name: "Write this task again" })).toHaveAttribute("href", `/app/writing/${tasks.essay}`);
  await page.screenshot({ path: test.info().outputPath("feedback-full.png"), fullPage: true });

  // Free: the summary only, locked sections.
  await context.clearCookies();
  const free = await student(context, baseURL!, "Finn Free");
  const freeId = await seedSubmission(free.id, tasks.essay, { band: 5.5, full: false });
  await page.goto(`/app/writing/submissions/${freeId}`);
  await expect(page.getByTestId("summary")).toContainText("held back by grammar slips");
  await expect(page.getByTestId("locked-feedback")).toContainText("3 corrections found");
  await page.screenshot({ path: test.info().outputPath("feedback-summary.png"), fullPage: true });

  // The Gold student's feedback isn't Free's to see.
  await page.goto(`/app/writing/submissions/${goldId}`);
  await expect(page.getByRole("heading", { name: /This page isn.t here/ })).toBeVisible();
  expect(await page.content()).not.toContain("is already plural");
});

test("F4: history and band trend", async ({ page, context, baseURL }) => {
  const me = await student(context, baseURL!, "Hal History", "gold");
  const day = (d: number) => new Date(Date.UTC(2026, 10, d, 9)).toISOString();
  await seedSubmission(me.id, tasks.essay, { band: 5, full: true, createdAt: day(2) });
  await seedSubmission(me.id, tasks.academic, { band: 5.5, full: true, createdAt: day(9) });
  const latest = await seedSubmission(me.id, tasks.essay, { band: 6.5, full: true, createdAt: day(20) });
  await page.goto("/app/writing");
  const history = page.getByRole("list", { name: "Your scored answers" });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").first()).toContainText("6.5");
  await expect(page.getByTestId("recent-average")).toContainText("5.7");
  const trend = page.getByTestId("band-trend");
  await expect(trend.getByRole("img")).toHaveAttribute("aria-label", "Writing band over your last 3 answers: from 5.0 to 6.5");
  await expect(trend.getByRole("link")).toHaveCount(3);
  // Keyboard: focusing a point shows its tooltip; the essay card shows its best band.
  await trend.getByRole("link").last().focus();
  await expect(page.getByRole("tooltip")).toContainText("6.5");
  await expect(page.getByTestId("writing-task").filter({ hasText: `E2E essay ${stamp}` })).toContainText("Written 2 times · best band 6.5");
  await page.screenshot({ path: test.info().outputPath("writing-home.png"), fullPage: true });
  await trend.getByRole("link").last().click();
  await expect(page).toHaveURL(new RegExp(`/app/writing/submissions/${latest}$`));
});

test("F2: photo upload — locked on Free; Gold reads a photo into the editor; QR on desktop", async ({ page, context, baseURL, isMobile }) => {
  await student(context, baseURL!, "Pia Free");
  await page.goto(`/app/writing/${tasks.essay}?photo=1`);
  await expect(page.getByRole("tab", { name: "Upload a photo" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("photo-locked")).toContainText("Photo upload is part of Gold");

  test.skip(!aiReady, NEEDS_AI);
  const { url } = localSupabase();
  const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
  if (!storageUp && process.env.CI) throw new Error("Storage is not running");
  test.skip(!storageUp, "Local Supabase is running without Storage");

  await context.clearCookies();
  await student(context, baseURL!, "Pat Photo", "gold");
  await page.goto(`/app/writing/${tasks.essay}?photo=1`);
  await expect(page.getByTestId("phone-qr")).toHaveCount(1); // rendered on both…
  if (isMobile) await expect(page.getByTestId("phone-qr")).toBeHidden(); // …shown on desktop only
  else await expect(page.getByTestId("phone-qr").getByRole("img")).toBeVisible();

  const jpeg = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 80;
    c.getContext("2d")!.fillRect(0, 0, 10, 10);
    const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/jpeg"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  // A small JPEG made in the page (the browser prepares it, uploads it, ocr-writing reads it).
  await page.getByTestId("photo-input").setInputFiles({ name: "page1.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpeg) });
  await expect(page.getByRole("img", { name: "Page 1" })).toBeVisible();
  await page.getByRole("button", { name: "Read my handwriting" }).click();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("This costs 1 credit");
  await page.getByRole("dialog").getByRole("button", { name: "Read my handwriting" }).click();
  await expect(page.getByTestId("answer")).not.toHaveValue("", { timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: "Text read from your photos" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Type your answer" })).toHaveAttribute("aria-selected", "true");
});
