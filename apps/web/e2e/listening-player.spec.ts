import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ONBOARDED, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M5-F1..F3 in the browser, on the built-in sample test (/app/listening/sample, not in
// production) until real Listening tests exist (M5-C1/B2): exam and practice playback, slow-
// network preloading, the answer sheet with map and diagram labelling, and results with
// transcripts. Parts are a few seconds long (?sec=).

let user: TestUser | undefined;

test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

async function open(page: Page, context: BrowserContext, baseURL: string, sec: number) {
  user = await createTestUser("Lena Listener", "user", ONBOARDED);
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
  await page.goto(`/app/listening/sample?sec=${sec}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sample Listening test");
}

const player = (page: Page) => page.getByTestId("audio-player");
const audioTime = (page: Page) => page.evaluate(() => document.querySelector("audio")!.currentTime);
/** The element is really playing (data loaded, not paused). */
const reallyPlaying = (page: Page) =>
  expect.poll(() => page.evaluate(() => (a => a.readyState >= 3 && !a.paused)(document.querySelector("audio")!))).toBe(true);

/** Pretend to be on a given network (Network Information API) before the page loads. */
async function network(context: BrowserContext, info: { effectiveType: string; downlink: number } | null) {
  await context.addInitScript((value) => {
    Object.defineProperty(navigator, "connection", { configurable: true, get: () => value ?? undefined });
  }, info);
}

test("M5-F1 practice mode: play, pause, seek, choose a part, replay", async ({ page, context, baseURL }) => {
  await open(page, context, baseURL!, 6);
  await page.getByTestId("mode-practice").click();
  await page.getByRole("button", { name: "Start in practice mode" }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "practice");

  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await player(page).getByRole("button", { name: "Pause" }).click();
  await expect(player(page)).toHaveAttribute("data-status", "paused");

  // Seek with the position slider.
  await player(page).getByRole("slider", { name: "Position" }).fill("4");
  expect(await audioTime(page)).toBeGreaterThan(3.5);
  await player(page).getByRole("button", { name: "Back 10 seconds" }).click();
  expect(await audioTime(page)).toBe(0);

  // Any part, and the answer sheet follows the recording.
  await player(page).getByRole("button", { name: "Part 3" }).click();
  await expect(player(page)).toHaveAttribute("data-section", "3");
  await expect(page.getByRole("tab", { name: /Part 3/ })).toHaveAttribute("aria-selected", "true");

  // Replay a part that has ended.
  await expect(player(page)).toHaveAttribute("data-status", "ended", { timeout: 15_000 });
  await player(page).getByRole("button", { name: "Replay part" }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
});

test("M5-F1 exam mode: once, in order, no seeking; then time to check", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  await open(page, context, baseURL!, 3);
  await page.getByRole("button", { name: "Start in exam mode" }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "exam");
  // No controls that would break the rules.
  await expect(player(page).getByRole("slider", { name: "Position" })).toHaveCount(0);
  await expect(player(page).getByRole("button", { name: /^Part \d/ })).toHaveCount(0);
  await expect(player(page).getByRole("button", { name: "Replay part" })).toHaveCount(0);
  await expect(page.locator("audio")).not.toHaveAttribute("controls");

  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  // A jump straight away, before the audio has loaded, is put back too.
  await page.evaluate(() => {
    document.querySelector("audio")!.currentTime = 2.5;
  });
  await reallyPlaying(page);
  await page.waitForTimeout(300);
  expect(await audioTime(page)).toBeLessThan(2);
  // Can't pause.
  await expect(player(page).getByRole("button", { name: "Playing" })).toBeDisabled();
  // Jumping ahead while playing (devtools, media keys) is put back.
  await page.evaluate(() => {
    document.querySelector("audio")!.currentTime = 2.8;
  });
  await page.waitForTimeout(400);
  expect(await audioTime(page)).toBeLessThan(2);
  // Pausing from outside the page resumes.
  await page.evaluate(() => document.querySelector("audio")!.pause());
  await expect(player(page)).toHaveAttribute("data-status", "playing");

  // Part 1 ends; after the gap, part 2 starts by itself and the sheet moves to it.
  await expect(player(page).getByTestId("player-note")).toContainText("Part 2 starts in", { timeout: 10_000 });
  await expect(player(page)).toHaveAttribute("data-section", "2", { timeout: 10_000 });
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await expect(page.getByRole("tab", { name: /Part 2/ })).toHaveAttribute("aria-selected", "true");

  // All four parts, then the checking time.
  await expect(page.getByTestId("check-time")).toContainText("Check your answers", { timeout: 60_000 });
  await expect(player(page).getByRole("button", { name: "Play", exact: true })).toBeDisabled();

  await page.getByRole("button", { name: "Submit answers" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  const results = page.getByTestId("listening-results");
  await expect(results).toContainText("Exam mode");
  await expect(page.getByTestId("raw-score")).toHaveText("0 of 40 correct");
  await expect(page.getByTestId("band")).toHaveText("0.0");
});

test("M5-F1 preloading: the next part is fetched ahead on a slow network, not on a fast one", async ({ page, context, baseURL }) => {
  await network(context, { effectiveType: "3g", downlink: 0.7 });
  const fetched: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/audio\/(\d)\?/);
    if (m) fetched.push(m[1]!);
  });
  await open(page, context, baseURL!, 6);
  await page.getByRole("button", { name: "Start in exam mode" }).click();
  await expect(player(page)).toHaveAttribute("data-preload-plan", "full");
  await expect(player(page)).toHaveAttribute("data-preloaded", "1");

  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  // Part 2 is in memory while part 1 is still playing.
  await expect(player(page)).toHaveAttribute("data-preloaded", "1,2");
  await expect(player(page)).toHaveAttribute("data-section", "1");
  expect(fetched).toContain("2");
});

test("M5-F1 preloading: a fast network only loads metadata ahead", async ({ page, context, baseURL }) => {
  await network(context, { effectiveType: "4g", downlink: 20 });
  await open(page, context, baseURL!, 6);
  await page.getByRole("button", { name: "Start in exam mode" }).click();
  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await expect(player(page)).toHaveAttribute("data-preload-plan", "metadata");
  await expect(player(page)).toHaveAttribute("data-preloaded", "");
});

test("M5-F2 + M5-F3: answer sheet, map and diagram labelling, results with transcripts", async ({ page, context, baseURL }) => {
  await open(page, context, baseURL!, 6);
  // Nothing of the answers or transcripts is in the page before submission.
  const html = await page.content();
  for (const secret of ["cheapest coffee", "Hillside Walking Club", '"accept"', '"explanation"']) expect(html).not.toContain(secret);

  await page.getByTestId("mode-practice").click();
  await page.getByRole("button", { name: "Start in practice mode" }).click();
  const sheet = page.getByTestId("answer-sheet");
  await expect(sheet.getByRole("navigation", { name: "Questions" }).getByRole("button")).toHaveCount(40);

  // Part 1: typed gaps with their word limit.
  await page.locator("#q1").fill("Hillside");
  await page.locator("#q2").fill("35");
  await expect(sheet.getByText("ONE WORD AND/OR A NUMBER").first()).toBeVisible();
  await expect(page.getByRole("tab", { name: /Part 1/ })).toContainText("2 of 10 answered");

  // Part 2: the map. Tapping a place answers the current question, then moves on.
  await page.getByRole("tab", { name: /Part 2/ }).click();
  const map = page.getByTestId("map-labelling");
  await expect(map.getByRole("img")).toBeVisible();
  await map.getByRole("button", { name: /^Place C/ }).click(); // Q11 Café
  await map.getByRole("button", { name: /^Place A/ }).click(); // Q12 Library
  await expect(map.locator('[data-q="11"] input[value="C"]')).toBeChecked();
  await expect(map.locator('[data-q="12"] input[value="A"]')).toBeChecked();
  await expect(map.getByRole("button", { name: /^Place C, chosen for question 11/ })).toBeVisible();
  // Multiple choice, one and two letters.
  await sheet.locator('[data-q="16"]').getByText("45 minutes").click();
  await sheet.locator('[data-q="20"]').getByText("a bank").click();
  await sheet.locator('[data-q="20"]').getByText("a print shop").click();

  // The navigator jumps across parts.
  await sheet.getByRole("button", { name: "Question 32" }).click();
  await expect(page.getByRole("tab", { name: /Part 4/ })).toHaveAttribute("aria-selected", "true");
  // Part 4: the diagram. A number on it jumps to that answer box.
  const diagram = page.getByTestId("diagram-labelling");
  await diagram.getByRole("button", { name: "Question 32 on the diagram" }).click();
  await expect(page.locator("#q32")).toBeFocused();
  await page.keyboard.type("sand");
  await page.locator("#q37").fill("very slowly");
  await expect(sheet.getByText(/Too long: one word only/)).toBeVisible();

  // Answers survive a reload (same mode).
  await page.reload();
  await page.getByTestId("mode-practice").click();
  await page.getByRole("button", { name: "Start in practice mode" }).click();
  await expect(page.locator("#q1")).toHaveValue("Hillside");

  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("dialog")).toContainText("Submit with 32 unanswered?");
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();

  const results = page.getByTestId("listening-results");
  // Right: 1, 2, 11, 12, 16, 20, 32 → 7/40 → band 3.
  await expect(page.getByTestId("raw-score")).toHaveText("7 of 40 correct");
  await expect(page.getByTestId("band")).toHaveText("3.0");
  await expect(results).toContainText("Practice mode");
  await expect(results.locator('[data-q="11"]')).toHaveAttribute("data-correct", "true");
  await expect(results.locator('[data-q="37"]')).toContainText("over the word limit");
  await expect(results.locator('[data-q="37"]')).toContainText("Correct answer: slowly");
  await expect(results.locator('[data-q="13"]')).toContainText("Your answer: —");

  // Transcripts, now.
  const transcript = page.getByTestId("transcript-2");
  await transcript.getByText("Transcript").click();
  await expect(transcript).toContainText("cheapest coffee on campus");
});
