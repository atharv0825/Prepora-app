import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M8-F1..F3 in the browser (Chromium's fake microphone, playwright.config.ts; the browser's voice
// is replaced by a recorder of what would be said, so the tests don't depend on installed voices):
//   * Always: there's no Speaking full test (no tile, no page); an earlier full test's results:
//     the overall band, each part's band and summary, "Go deeper", and a part's feedback page
//     linking back.
//   * With E2E_AI=1 (the ai-stub in CI; Storage and the functions needed): Part 1 practice with
//     the examiner (questions read aloud in a British voice, recording after each, 4–5 answers →
//     scored → feedback).

const stubAi = process.env.E2E_AI === "1";
const stamp = Math.random().toString(36).slice(2, 8);
const ids = { set: "", card: "", discussion: "", discussion2: "" };
let users: TestUser[] = [];

test.use({ permissions: ["microphone"] });
test.skip(({ isMobile }) => isMobile, "the desktop project covers these flows");

test.beforeAll(async () => {
  const db = adminClient();
  const one = async (row: Record<string, unknown>) => {
    const { data, error } = await db.from("speaking_topics").insert(row as never).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  ids.set = await one({ part: 1, title: `E2E hometown ${stamp}`, questions: ["Where is your hometown?", "What do you like about it?", "Has it changed much?", "Would you live there in future?", "Do you often go back?"], status: "published" });
  ids.card = await one({ part: 2, title: `E2E a park ${stamp}`, cue_card_points: ["where it is", "when you go", "what you do", "and why you like it"], status: "published" });
  ids.discussion = await one({ part: 3, title: `E2E public spaces ${stamp}`, parent_topic_id: ids.card, questions: ["Why do cities need parks?", "Who should pay for them?", "Will parks change in future?", "Are parks better than gyms?"], status: "published" });
  ids.discussion2 = await one({ part: 3, title: `E2E nature ${stamp}`, parent_topic_id: ids.card, questions: ["Is nature important to children?", "Why?", "How?", "When?"], status: "published" });
});

test.afterAll(async () => {
  const db = adminClient();
  const all = [ids.discussion, ids.discussion2, ids.set, ids.card].filter(Boolean);
  await db.from("speaking_responses").delete().in("topic_id", all);
  await db.from("speaking_topics").update({ status: "archived" }).in("id", all);
  for (const id of all) await db.from("speaking_topics").delete().eq("id", id); // Part 3 before its card
});

test.afterEach(async () => {
  const db = adminClient();
  for (const u of users) {
    const { data } = await db.storage.from("speaking-audio").list(u.id);
    if (data?.length) await db.storage.from("speaking-audio").remove(data.map((f) => `${u.id}/${f.name}`));
    await db.from("speaking_sessions").delete().eq("user_id", u.id);
  }
  await Promise.all(users.map((u) => deleteTestUser(u)));
  users = [];
});

async function student(context: BrowserContext, baseURL: string, name: string, plan: "free" | "gold" = "gold") {
  const u = await createTestUser(name, "user", { ...ONBOARDED, timezone: "UTC" });
  users.push(u);
  if (plan !== "free") await adminClient().from("profiles").update({ plan }).eq("id", u.id);
  await context.addCookies(u.cookies.map((c) => ({ ...c, url: baseURL })));
  return u;
}

/** The browser's voice, replaced: every question "said" is recorded with its voice, and ends at once. */
async function fakeVoice(page: Page) {
  await page.addInitScript(() => {
    const said: { text: string; lang: string; voice: string | null }[] = [];
    (window as unknown as { __said: typeof said }).__said = said;
    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      voice: { name: string; lang: string } | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    const voices = [
      { name: "US English", lang: "en-US", localService: true, voiceURI: "us", default: true },
      { name: "UK English", lang: "en-GB", localService: true, voiceURI: "uk", default: false },
    ];
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (u: Utterance) => {
          said.push({ text: u.text, lang: u.lang, voice: u.voice?.name ?? null });
          setTimeout(() => u.onend?.(), 50);
        },
        cancel: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
  });
}

async function micCheck(page: Page) {
  await page.getByRole("button", { name: "Allow microphone" }).click();
  await expect(page.getByTestId("mic-status")).toHaveText("We can hear you.", { timeout: 10_000 });
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Answer the examiner until the part ends: each question is read, recording starts, Done. */
async function answerExaminer(page: Page, until: ReturnType<Page["getByTestId"]>) {
  let answers = 0;
  for (; answers < 8; answers++) {
    const recording = page.getByTestId("answer-recording");
    await expect(recording.or(until)).toBeVisible({ timeout: 60_000 });
    if (await until.isVisible()) break;
    await page.waitForTimeout(1_200);
    await recording.getByRole("button", { name: "Done" }).click();
    await expect(recording).toBeHidden();
  }
  return answers;
}

test("M8-F3: an earlier full test's results — overall band, each part, go deeper; no full test any more", async ({ page, context, baseURL }) => {
  const u = await student(context, baseURL!, "Rae Results");
  const db = adminClient();
  const session = crypto.randomUUID();
  const { error } = await db
    .from("speaking_sessions")
    .insert({ id: session, user_id: u.id, mode: "full_test", status: "completed", part1_band: 6, part2_band: 7, part3_band: 6.5, overall_band: 6.5, completed_at: new Date().toISOString() });
  if (error) throw error;
  const signals = { duration_sec: 95, words: 180, words_per_minute: 114, pauses: 3, longest_pause_sec: 2, filler_count: 0, transcript_confidence: 0.9 };
  const rows = [
    { part: 1, topic_id: ids.set, band: 6, scores: { fc: 6, lr: 6, gra: 6, pron: 6 }, summary: "Part one summary." },
    { part: 2, topic_id: ids.card, band: 7, scores: { fc: 7, lr: 7, gra: 7, pron: 7 }, summary: "Part two summary." },
    { part: 3, topic_id: ids.discussion, band: 6.5, scores: { fc: 6.5, lr: 6.5, gra: 6.5, pron: 6.5 }, summary: "Part three summary." },
  ];
  const made: string[] = [];
  for (const r of rows) {
    const { data, error: e } = await db
      .from("speaking_responses")
      .insert({
        session_id: session,
        user_id: u.id,
        part: r.part,
        topic_id: r.topic_id,
        audio_paths: [],
        transcript: r.part === 2 ? "I go to the park." : "Examiner: Where is your hometown?\nYou: In the north.",
        signals,
        scores: r.scores,
        band: r.band,
        feedback: { detail: "summary", summary: r.summary, better_phrases_count: 0 },
      })
      .select("id")
      .single();
    if (e) throw e;
    made.push(data.id);
  }

  await page.goto(`/app/speaking/sessions/${session}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Full test results");
  await expect(page.getByTestId("overall-band")).toHaveText("6.5");
  await expect(page.getByTestId("part-1-band")).toHaveText("6.0");
  await expect(page.getByTestId("part-2-band")).toHaveText("7.0");
  await expect(page.getByTestId("part-3")).toContainText(`E2E public spaces ${stamp}`);
  await expect(page.getByTestId("part-3")).toContainText("Part three summary.");
  await expect(page.getByTestId("part-1")).toContainText("Fluency");
  // Go deeper: the card's other discussion. No "Next cue card" (it started a new full test).
  await expect(page.getByTestId("go-deeper")).toHaveAttribute("href", `/app/speaking/examiner/${ids.discussion2}`);
  await expect(page.getByTestId("next-card")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("speaking-session-results.png"), fullPage: true });

  // A part's feedback says where it came from and links back.
  await page.getByTestId("part-1").getByRole("link", { name: /Full feedback/ }).click();
  await expect(page).toHaveURL(new RegExp(`/app/speaking/responses/${made[0]}$`));
  await expect(page.getByTestId("response-part")).toHaveText("Part 1 · full test");
  await expect(page.getByRole("link", { name: "Practise this Part 1 again" })).toHaveAttribute("href", `/app/speaking/examiner/${ids.set}`);
  await page.getByRole("link", { name: "Back to the test results" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/speaking/sessions/${session}$`));

  // The home: every part in the history; no full test tile or test list.
  await page.goto("/app/speaking");
  await expect(page.getByTestId("full-test-cta")).toHaveCount(0);
  await expect(page.getByTestId("test-history")).toHaveCount(0);
  await expect(page.getByTestId("speaking-history").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByTestId("speaking-history")).toContainText("Part 3");

  // The full test page is gone.
  expect((await page.goto("/app/speaking/test"))?.status()).toBe(404);
});

test("M8-F1 (functions routed in the browser): the turn loop, what's sent, and a scoring retry", async ({ page, context, baseURL }) => {
  await student(context, baseURL!, "Rory Routed");
  await fakeVoice(page);
  const QUESTIONS = ["Where is your hometown?", "What do you like about it?", "Has it changed much?", "Would you live there in future?"];
  const turns: { turns: { question: string; audio_path?: string; transcript?: string }[] }[] = [];
  const scored: { part: number; answers: { question: string; audio_path: string }[] }[] = [];
  await page.route("**/storage/v1/object/speaking-audio/**", (route) => route.fulfill({ status: 200, json: { Key: "ok" } }));
  await page.route(/\/functions\/v1\/examiner-turn/, async (route) => {
    const body = route.request().postDataJSON() as (typeof turns)[number];
    turns.push(body);
    const n = body.turns.length;
    const transcribed = n ? { index: n - 1, transcript: `Answer ${n}.` } : null;
    await route.fulfill({
      json: n >= QUESTIONS.length ? { transcribed, next_question: null, source: null, question_no: null, done: true } : { transcribed, next_question: QUESTIONS[n], source: "set", question_no: n + 1, done: false },
    });
  });
  await page.route(/\/functions\/v1\/score-speaking/, async (route) => {
    scored.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, json: { error: { code: "internal", message: "The AI is busy." } } });
  });

  await page.goto(`/app/speaking/examiner/${ids.set}`);
  await page.getByRole("button", { name: "Start Part 1" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Start" }).click();
  await micCheck(page);
  await expect(page.getByTestId("examiner-question")).toContainText("Question 1");
  const alert = page.getByRole("alert").filter({ hasText: "couldn't be scored" });
  expect(await answerExaminer(page, alert)).toBe(4);
  await expect(page.getByTestId("examiner-progress")).toHaveText("4 of 4–5 answered");
  await expect(alert).toContainText("The AI is busy.");

  // One opening call, then one per answer: older answers carry their transcript, the newest only its recording.
  expect(turns).toHaveLength(5);
  expect(turns[0]!.turns).toEqual([]);
  expect(turns[2]!.turns.map((t) => t.transcript)).toEqual(["Answer 1.", undefined]);
  expect(turns[4]!.turns[3]!.audio_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}-p1-q4-[0-9a-f]{8}\.webm$/);
  expect(scored[0]).toMatchObject({ part: 1, topic_id: ids.set });
  expect(scored[0]!.answers.map((a) => a.question)).toEqual(QUESTIONS);
  // Try again repeats the scoring only (no new turns, no re-recording).
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toBeVisible();
  expect(scored).toHaveLength(2);
  expect(turns).toHaveLength(5);
  const said = await page.evaluate(() => (window as unknown as { __said: { text: string }[] }).__said.map((s) => s.text));
  expect(said).toEqual(QUESTIONS);
});

test.describe("with the examiner (stubbed AI)", () => {
  test.beforeEach(async () => {
    test.skip(!stubAi, "needs Storage and the functions with an AI (E2E_AI=1: the ai-stub in CI)");
    const storageUp = (await fetch(`${localSupabase().url}/storage/v1/version`).catch(() => null))?.ok ?? false;
    test.skip(!storageUp, "Local Supabase is running without Storage");
  });

  test("M8-F1: Part 1 practice — read aloud in a British voice, answer, next question, scored", async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);
    await student(context, baseURL!, "Eli Examiner");
    await fakeVoice(page);
    await page.goto(`/app/speaking/examiner/${ids.set}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Speaking Part 1");
    await page.getByRole("button", { name: "Start Part 1" }).click();
    await expect(page.getByRole("dialog").getByRole("heading")).toHaveText("This costs 5 credits");
    await page.getByRole("dialog").getByRole("button", { name: "Start" }).click();
    await micCheck(page);

    await expect(page.getByTestId("examiner-question")).toContainText("Where is your hometown?", { timeout: 60_000 });
    const answers = await answerExaminer(page, page.getByTestId("speaking-feedback"));
    expect(answers).toBeGreaterThanOrEqual(4);
    await expect(page).toHaveURL(/\/app\/speaking\/responses\/[0-9a-f-]{36}$/);
    await expect(page.getByTestId("response-part")).toHaveText("Part 1");
    await expect(page.getByTestId("transcript")).toContainText("Where is your hometown?");

    const said = await page.evaluate(() => (window as unknown as { __said: { text: string; lang: string; voice: string | null }[] }).__said);
    expect(said.length).toBe(answers);
    expect(said[0]).toEqual({ text: "Where is your hometown?", lang: "en-GB", voice: "UK English" });
  });

});
