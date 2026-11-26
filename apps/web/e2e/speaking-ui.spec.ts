import { expect, test, type BrowserContext } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M7-F1..F3 in the browser, with Chromium's fake microphone (a steady beep; playwright.config.ts):
//   * F1: the mic explainer → permission → the level meter hears the microphone → continue; a
//     refused microphone shows per-browser help.
//   * F2: cue card → 1-minute prep with notes → recording (real MediaRecorder) → stop → playback,
//     with the under-a-minute warning.
//   * F3: a failed upload keeps the recording on the device (IndexedDB): after a reload the student
//     can send it or record again. Scoring end to end needs Storage and the functions with an AI
//     (E2E_AI=1: the ai-stub in CI). Stored feedback pages: Gold full, Free locked, others 404.

const stubAi = process.env.E2E_AI === "1";
const stamp = Math.random().toString(36).slice(2, 8);
let cardId = "";
let users: TestUser[] = [];

test.use({ permissions: ["microphone"] });

test.beforeAll(async () => {
  const { data, error } = await adminClient()
    .from("speaking_topics")
    .insert({ part: 2, title: `E2E describe a place ${stamp}`, cue_card_points: ["where it is", "how often you go there", "what you do there", "and explain why you like it"], status: "published" })
    .select("id")
    .single();
  if (error) throw error;
  cardId = data.id;
});

test.afterAll(async () => {
  const db = adminClient();
  await db.from("speaking_responses").delete().eq("topic_id", cardId);
  await db.from("speaking_topics").update({ status: "archived" }).eq("id", cardId);
  await db.from("speaking_topics").delete().eq("id", cardId);
});

test.afterEach(async () => {
  const db = adminClient();
  for (const u of users) await db.from("speaking_sessions").delete().eq("user_id", u.id);
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

async function seedResponse(u: TestUser, full: boolean) {
  const db = adminClient();
  const session = crypto.randomUUID();
  await db.from("speaking_sessions").insert({ id: session, user_id: u.id, mode: "part2" });
  const phrases = [{ original: "very delicious", better: "absolutely delicious", why: "\"Delicious\" is already strong." }];
  const { data, error } = await db
    .from("speaking_responses")
    .insert({
      session_id: session,
      user_id: u.id,
      topic_id: cardId,
      part: 2,
      audio_paths: [],
      duration_sec: 95,
      transcript: "Um, I go to the beach, you know, and the food is very delicious. Uh, I love it.",
      signals: { duration_sec: 95, words: 18, words_per_minute: 120, pauses: 3, longest_pause_sec: 2.4, filler_count: 3, transcript_confidence: 0.9 },
      scores: { fc: 6, lr: 6.5, gra: 6, pron: 7 },
      band: 6.5,
      feedback: full
        ? { detail: "full", summary: "A fluent, relevant answer.", better_phrases: phrases, strengths: ["Clear structure."], improvements: ["Fewer fillers."], model_answer: "I'd like to talk about…" }
        : { detail: "summary", summary: "A fluent, relevant answer.", better_phrases_count: 1 },
      prompt_version: "s2-v1",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

test("F1 + F2: dashboard → cue card; mic test; prepare; record; stop; listen back", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Mia Mic");
  await page.goto("/app");
  await page.getByRole("region", { name: "Practise" }).getByRole("link", { name: /Speaking/ }).click();
  await expect(page).toHaveURL(/\/app\/speaking$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Speaking");
  await expect(page.getByText(/Scoring costs 4 credits/)).toBeVisible();
  const card = page.getByTestId("cue-card-item").filter({ hasText: `E2E describe a place ${stamp}` });
  await expect(card).toContainText("Not answered yet");
  await card.getByRole("link", { name: /Start/ }).click();

  // F1: explainer → permission → the meter hears the (fake) microphone.
  await expect(page.getByTestId("mic-explainer")).toContainText("deleted after 30 days");
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByTestId("mic-status")).toHaveText("We can hear you.", { timeout: 10_000 });
  await page.getByRole("button", { name: "Continue" }).click();

  // F2: the card, then preparation with notes.
  await expect(page.getByTestId("cue-card")).toContainText("how often you go there");
  await page.getByRole("button", { name: "Start my 1 minute" }).click();
  await expect(page.getByTestId("prep-timer")).toHaveText(/Prepare: 0:5\d|Prepare: 1:00/);
  await page.getByRole("textbox", { name: "Notes" }).fill("beach — weekends — swim — peaceful");
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await expect(page.getByTestId("recording")).toContainText("Recording 0:0");
  await expect(page.getByTestId("recording")).toContainText("beach — weekends"); // notes stay visible
  await page.waitForTimeout(3_000);
  await page.getByRole("button", { name: "Stop" }).click();

  // Review: a real recording to play back, and the short-answer warning.
  const review = page.getByTestId("review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("recorded-length")).toHaveText(/^0:0[2-4] recorded\.$/);
  await expect(review).toContainText("Under a minute");
  const duration = await page.getByTestId("playback").evaluate(async (a: HTMLAudioElement) => {
    const blob = await (await fetch(a.src)).blob();
    return { size: blob.size, type: blob.type };
  });
  expect(duration.size).toBeGreaterThan(1000);
  expect(duration.type).toMatch(/^audio\/webm/);
  await expect(page.getByRole("button", { name: "Record again" })).toBeVisible();
});

test("F1: a blocked microphone shows how to allow it in this browser", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Dan Denied");
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await page.goto(`/app/speaking/${cardId}`);
  await page.getByRole("button", { name: "Allow microphone" }).click();
  const problem = page.getByTestId("mic-problem");
  await expect(problem).toContainText("Your browser blocked the microphone for this site.");
  await expect(page.getByTestId("mic-help")).toContainText("To allow it in Chrome");
  await expect(page.getByTestId("mic-help")).toContainText("Set Microphone to Allow.");
  await expect(problem.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("F3: a failed upload keeps the recording on this device; after a reload it can be sent or discarded", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Uma Upload");
  // The connection drops on every upload attempt.
  await page.route("**/storage/v1/object/speaking-audio/**", (route) => route.abort("connectionfailed"));
  await page.goto(`/app/speaking/${cardId}`);
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByTestId("mic-status")).toHaveText("We can hear you.", { timeout: 10_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my 1 minute" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Get my band score" }).click();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("This costs 4 credits");
  await page.getByRole("dialog").getByRole("button", { name: "Score my answer" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "The upload failed" })).toContainText("Your recording is saved on this device", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();

  // A reload (or a closed tab) doesn't lose it.
  await page.reload();
  const pending = page.getByTestId("pending-recording");
  await expect(pending).toContainText("You have a recording that wasn't scored");
  await expect(pending).toContainText(/0:0\d recorded on this device/);
  await pending.getByRole("button", { name: "Record a new answer" }).click();
  await expect(page.getByTestId("mic-explainer")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("mic-explainer")).toBeVisible(); // discarded for good
});

test("F3 (stubbed AI): record → upload with progress → scored → the saved feedback", async ({ page, context, baseURL }) => {
  test.skip(!stubAi, "needs Storage and the functions with an AI (E2E_AI=1: the ai-stub in CI)");
  test.setTimeout(180_000);
  const { url } = localSupabase();
  const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
  test.skip(!storageUp, "Local Supabase is running without Storage");
  await student(context, baseURL!, "Gus Gold", "gold");
  await page.goto(`/app/speaking/${cardId}`);
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByTestId("mic-status")).toHaveText("We can hear you.", { timeout: 10_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my 1 minute" }).click();
  await page.getByRole("button", { name: "Start speaking now" }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Get my band score" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Score my answer" }).click();
  await expect(page).toHaveURL(/\/app\/speaking\/responses\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  await expect(page.getByTestId("band")).toHaveText("6.0");
  await expect(page.getByTestId("transcript").locator("mark[data-filler]").first()).toBeVisible();
  await expect(page.getByTestId("better-phrase")).toHaveCount(3);
  await expect(page.getByTestId("recording-playback")).toBeVisible();
});

test("F3: stored feedback — Gold full with highlights, Free locked, nobody else", async ({ page, context, baseURL }) => {
  const gold = await student(context, baseURL!, "Gina Gold", "gold");
  const goldId = await seedResponse(gold, true);
  await page.goto(`/app/speaking/responses/${goldId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`E2E describe a place ${stamp}`);
  await expect(page.getByTestId("band")).toHaveText("6.5");
  await expect(page.getByTestId("criterion-pron")).toContainText("Pronunciation");
  await expect(page.getByTestId("signals")).toContainText("120 wpm");
  await expect(page.getByTestId("signals")).toContainText("longest 2.4 s");
  const transcript = page.getByTestId("transcript");
  await expect(transcript.locator("mark[data-filler]")).toHaveText(["Um", "you know", "Uh"]);
  await expect(transcript.getByRole("link")).toHaveText(["very delicious1"]);
  await expect(page.getByTestId("better-phrase")).toContainText("absolutely delicious");
  await expect(page.getByTestId("model-answer")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("speaking-feedback-full.png"), fullPage: true });

  await context.clearCookies();
  const free = await student(context, baseURL!, "Finn Free");
  const freeId = await seedResponse(free, false);
  await page.goto(`/app/speaking/responses/${freeId}`);
  await expect(page.getByTestId("locked-feedback")).toContainText("1 better phrase found");
  await expect(page.getByTestId("transcript").locator("mark[data-filler]")).toHaveCount(3); // fillers for everyone
  await expect(page.getByTestId("better-phrase")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("speaking-feedback-free.png"), fullPage: true });

  await page.goto(`/app/speaking/responses/${goldId}`);
  await expect(page.getByRole("heading", { name: /This page isn.t here/ })).toBeVisible();

  // The history lists the student's own answer.
  await page.goto("/app/speaking");
  await expect(page.getByTestId("speaking-history").getByRole("listitem")).toHaveCount(1);
  await expect(page.getByTestId("cue-card-item").filter({ hasText: stamp })).toContainText("Best band 6.5");
});
