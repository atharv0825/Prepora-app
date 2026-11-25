import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { listeningBand } from "@prepora/shared/ielts/listening";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M5-I1: a published Listening test (M5-C1 tables, built as the admin builder would, M5-A1),
// taken in the browser and marked by grade-test (M5-B2):
//   * practice mode, end to end: play, seek, answer (typed gap, map, multiple choice, diagram),
//     submit → results with the band, the correct answers and the transcripts; saved as practice;
//   * exam mode on Safari for iPhone (the "ios-safari" project: WebKit with an iPhone profile; it
//     also runs on the Chromium projects): each recording plays once, in order, with no pause,
//     seek or replay; saved as exam.
// Recordings are the sample route's tones (/app/listening/sample/audio, not in production), which
// answer Range requests like the R2 CDN. Needs the Edge Functions: skipped locally without them,
// fails in CI.

const BASE = "http://localhost:3200"; // playwright.config.ts
const { url } = localSupabase();
const TRANSCRIPT = "Welcome to Riverside Leisure Centre. A swim costs twelve pounds";

let user: TestUser | undefined;
let testId: string | undefined;

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
  const { data: t, error } = await db.from("listening_tests").insert({ title: `E2E Listening ${Date.now()}`, min_plan: "free" }).select("id").single();
  if (error) throw error;
  testId = t.id;
  const { data: sections, error: sError } = await db
    .from("listening_sections")
    .insert(
      [1, 2, 3, 4].map((n) => ({
        test_id: t.id,
        order_no: n,
        title: `Part ${n}`,
        audio_url: `${BASE}/app/listening/sample/audio/${n}?sec=3`,
        duration_sec: 3,
        transcript: n === 1 ? `${TRANSCRIPT}. The café is opposite the entrance.` : `Transcript of part ${n}.`,
      })),
    )
    .select("id, order_no");
  if (sError) throw sError;
  const s1 = sections.find((s) => s.order_no === 1)!.id;
  const image = { image_url: `${BASE}/logo.png`, image_alt: "Plan of the leisure centre" };
  const { error: qError } = await db.from("listening_questions").insert([
    { test_id: t.id, section_id: s1, q_no: 1, q_type: "note_table_completion", prompt: "A swim costs £___", options: { max_words: 1, number_allowed: true }, answer: { accept: ["12"] }, explanation: "Twelve pounds." },
    { test_id: t.id, section_id: s1, q_no: 2, q_type: "map_labelling", prompt: "Café", options: { ...image, locations: [{ label: "A", x: 20, y: 30 }, { label: "B", x: 50, y: 60 }, { label: "C", x: 80, y: 30 }] }, answer: { label: "B" }, explanation: "Opposite the entrance." },
    { test_id: t.id, section_id: s1, q_no: 3, q_type: "mcq", prompt: "The centre opens at", options: { choices: ["6 am", "7 am", "8 am"], select: 1 }, answer: { labels: ["B"] }, explanation: null },
    { test_id: t.id, section_id: s1, q_no: 4, q_type: "diagram_labelling", prompt: "Part on top", options: { ...image, marker: { x: 50, y: 10 }, max_words: 1, number_allowed: false }, answer: { accept: ["filter"] }, explanation: null },
  ]);
  if (qError) throw qError;
  const { error: pError } = await db.from("listening_tests").update({ status: "published" }).eq("id", t.id);
  if (pError) throw pError;
});

test.afterAll(async () => {
  if (!testId) return;
  const db = adminClient();
  await db.from("test_attempts").delete().eq("test_id", testId);
  await db.from("listening_tests").update({ status: "archived" }).eq("id", testId);
  await db.from("listening_tests").delete().eq("id", testId);
});

test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

async function open(page: Page, context: BrowserContext, baseURL: string) {
  user = await createTestUser("Isla Listener", "user", ONBOARDED);
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL })));
  await page.goto(`/app/listening/${testId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^E2E Listening/);
}

const player = (page: Page) => page.getByTestId("audio-player");
const audioTime = (page: Page) => page.evaluate(() => document.querySelector("audio")!.currentTime);

async function submit(page: Page) {
  await page.getByRole("button", { name: "Submit answers" }).click();
  const dialog = page.getByRole("dialog");
  // The confirm dialog shows when questions are unanswered.
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole("button", { name: "Submit" }).click();
}

async function savedMode(attempts: number) {
  await expect
    .poll(async () => (await adminClient().from("test_attempts").select("mode").eq("user_id", user!.id).eq("test_id", testId!)).data ?? [])
    .toHaveLength(attempts);
  return (await adminClient().from("test_attempts").select("mode").eq("user_id", user!.id).eq("test_id", testId!)).data!.map((a) => a.mode);
}

test("M5-I1: a published test in practice mode, from the first part to the results", async ({ page, context, baseURL, browserName }) => {
  test.skip(browserName === "webkit", "Safari runs the exam-mode test");
  test.setTimeout(90_000);
  await open(page, context, baseURL!);
  // Nothing that gives answers away before submission.
  const html = await page.content();
  for (const secret of [TRANSCRIPT, "Opposite the entrance", '"accept"', '"answer"', '"transcript"']) expect(html).not.toContain(secret);

  await page.getByRole("button", { name: "Start in practice mode" }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "practice");
  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await player(page).getByRole("button", { name: "Pause" }).click();
  await player(page).getByRole("slider", { name: "Position" }).fill("2");
  expect(await audioTime(page)).toBeGreaterThan(1.5);

  const sheet = page.getByTestId("answer-sheet");
  await expect(sheet.getByRole("navigation", { name: "Questions" }).getByRole("button")).toHaveCount(4);
  await page.locator("#q1").fill("12");
  await page.getByTestId("map-labelling").getByRole("button", { name: /^Place B/ }).click(); // Q2
  await sheet.locator('[data-q="3"]').getByText("7 am").click();
  await page.locator("#q4").fill("filtre"); // misspelt: wrong

  await submit(page);
  const results = page.getByTestId("listening-results");
  await expect(page.getByTestId("raw-score")).toHaveText("3 of 4 correct", { timeout: 20_000 });
  await expect(page.getByTestId("band")).toHaveText(listeningBand(3, 4).toFixed(1));
  await expect(results).toContainText("Practice mode");
  await expect(results.locator('[data-q="2"]')).toHaveAttribute("data-correct", "true");
  await expect(results.locator('[data-q="4"]')).toContainText("Correct answer: filter");
  await expect(results).toContainText(TRANSCRIPT); // only now
  expect(await savedMode(1)).toEqual(["practice"]);
});

/** Can this browser play the test's audio at all? Playwright's WebKit on Windows can't play media. */
async function canPlayAudio(page: Page): Promise<string | null> {
  return page.evaluate(async (src) => {
    const a = new Audio(src);
    a.muted = true;
    const result = await Promise.race([
      a.play().then(
        () => null,
        (e: Error) => `${e.name}: ${e.message}`,
      ),
      new Promise<string>((r) => setTimeout(() => r("play() didn't answer in 5 s"), 5000)),
    ]);
    a.pause();
    return result;
  }, `/app/listening/sample/audio/1?sec=3`);
}

test("M5-I1: exam mode plays each recording once (Safari on iPhone)", async ({ page, context, baseURL, browserName }) => {
  test.setTimeout(120_000);
  await open(page, context, baseURL!);
  if (browserName === "webkit") {
    const problem = await canPlayAudio(page);
    if (problem && process.env.CI) throw new Error(`WebKit can't play audio here: ${problem}`);
    test.skip(!!problem, `This WebKit build can't play media (${problem}); CI runs it on Linux`);
  }
  await page.getByRole("button", { name: "Start in exam mode" }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "exam");
  // Answered while the part plays (the sheet then follows the recording to part 2).
  await page.locator("#q1").fill("12");
  // Nothing that would break the rules.
  await expect(player(page).getByRole("slider", { name: "Position" })).toHaveCount(0);
  await expect(player(page).getByRole("button", { name: /^Part \d/ })).toHaveCount(0);
  await expect(player(page).getByRole("button", { name: "Replay part" })).toHaveCount(0);
  await expect(page.locator("audio")).not.toHaveAttribute("controls");

  // A tap starts part 1 (iOS needs a gesture to play sound).
  await player(page).getByRole("button", { name: "Play", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await expect(player(page).getByRole("button", { name: "Playing" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => document.querySelector("audio")!.readyState >= 3), { timeout: 15_000 }).toBe(true);
  // Jumping ahead (as from the lock screen or media keys) is put back.
  await page.evaluate(() => {
    document.querySelector("audio")!.currentTime = 2.7;
  });
  await expect.poll(() => audioTime(page)).toBeLessThan(2);

  // Part 1 ends and can't be heard again; part 2 follows by itself.
  await expect(player(page).getByTestId("player-note")).toContainText("Part 2 starts in", { timeout: 15_000 });
  await expect(player(page)).toHaveAttribute("data-section", "2", { timeout: 15_000 });
  await expect(player(page)).toHaveAttribute("data-status", "playing");
  await expect(player(page).getByRole("button", { name: "Replay part" })).toHaveCount(0);

  await submit(page);
  await expect(page.getByTestId("listening-results")).toContainText("Exam mode", { timeout: 20_000 });
  await expect(page.getByTestId("raw-score")).toHaveText("1 of 4 correct");
  expect(await savedMode(1)).toEqual(["exam"]);
});
