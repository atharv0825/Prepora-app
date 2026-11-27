import { expect, test } from "@playwright/test";
import { listeningBand } from "@prepora/shared/ielts/listening";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// The Listening home: the dashboard tile opens /app/listening, which lists published tests (Gold
// locked), this month's Listening allowance and the student's attempts; an attempt reopens its
// results with the transcripts (get_listening_attempt), and nobody else can open it.
// Attempts are made through grade-test (M5-B2), so the Edge Functions must run: skipped locally
// without them, fails in CI.

const BASE = "http://localhost:3200"; // playwright.config.ts
const { url, publishableKey } = localSupabase();
const stamp = Math.random().toString(36).slice(2, 8);
const titles = { free: `E2E Listening home ${stamp}`, gold: `E2E Listening Gold ${stamp}` };
const ids: Record<"free" | "gold", string> = { free: "", gold: "" };
let users: TestUser[] = [];

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
  for (const kind of ["free", "gold"] as const) {
    const { data: t, error } = await db.from("listening_tests").insert({ title: titles[kind], min_plan: kind }).select("id").single();
    if (error) throw error;
    ids[kind] = t.id;
    const { data: sections } = await db
      .from("listening_sections")
      .insert(
        [1, 2, 3, 4].map((n) => ({
          test_id: t.id,
          order_no: n,
          title: `Part ${n}`,
          audio_url: `${BASE}/app/listening/sample/audio/${n}?sec=3`,
          transcript: `Home transcript of part ${n}.`,
        })),
      )
      .select("id, order_no");
    const s1 = sections!.find((s) => s.order_no === 1)!.id;
    await db.from("listening_questions").insert([
      { test_id: t.id, section_id: s1, q_no: 1, q_type: "tfng", prompt: "It is open.", options: {}, answer: { value: "true" }, explanation: "Part 1." },
      { test_id: t.id, section_id: s1, q_no: 2, q_type: "short_answer", prompt: "Who?", options: { max_words: 2 }, answer: { accept: ["the guide"] }, explanation: null },
    ]);
    const { error: pError } = await db.from("listening_tests").update({ status: "published" }).eq("id", t.id);
    if (pError) throw pError;
  }
});

test.afterAll(async () => {
  const db = adminClient();
  const list = Object.values(ids).filter(Boolean);
  if (list.length) {
    await db.from("test_attempts").delete().in("test_id", list);
    await db.from("listening_tests").update({ status: "archived" }).in("id", list);
    await db.from("listening_tests").delete().in("id", list);
  }
});

test.afterEach(async () => {
  await Promise.all(users.map((u) => deleteTestUser(u)));
  users = [];
});

async function student(name: string) {
  const u = await createTestUser(name, "user", { ...ONBOARDED, timezone: "UTC" });
  users.push(u);
  return u;
}

test("dashboard → Listening list → take a test → history → reopen the results", async ({ page, context, baseURL }) => {
  const me = await student("Lina Listener");
  await context.addCookies(me.cookies.map((c) => ({ ...c, url: baseURL! })));

  await page.goto("/app");
  await page.getByRole("region", { name: "Practise" }).getByRole("link", { name: /Listening/ }).click();
  await expect(page).toHaveURL(/\/app\/listening$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Listening");
  // Completion bar on the list (the monthly limit moved to the test's start screen).
  await expect(page.getByTestId("listening-progress")).toContainText(/^0 of \d+ Listening tests? completed · 0%$/);
  const cards = page.getByTestId("listening-test");
  await expect(cards.filter({ hasText: titles.free })).toContainText("Not taken yet");
  await expect(cards.filter({ hasText: titles.free }).getByRole("link", { name: /Start test/ })).toHaveAttribute("href", `/app/listening/${ids.free}`);
  await expect(cards.filter({ hasText: titles.gold }).getByRole("link", { name: "Unlock with Gold" })).toHaveAttribute("href", "/app/plans");
  await expect(page.getByRole("region", { name: "Your attempts" })).toContainText("No tests taken yet.");

  // A test taken in exam mode (as the player sends it): 1 of 2 right.
  const res = await fetch(`${url}/functions/v1/grade-test`, {
    method: "POST",
    headers: { apikey: publishableKey, authorization: `Bearer ${me.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ module: "listening", test_id: ids.free, mode: "exam", answers: { "1": "true", "2": "a guide" }, time_taken_sec: 1500 }),
  });
  expect(res.status).toBe(200);
  const band = listeningBand(1, 2).toFixed(1);

  // The start screen shows the monthly limit.
  await page.goto(`/app/listening/${ids.free}`);
  await expect(page.getByTestId("allowance")).toHaveText("1 of 2 used");
  await expect(page.getByRole("button", { name: /Start in exam mode/ })).toBeVisible();
  await page.goto("/app/listening");
  await expect(page.getByTestId("listening-progress")).toContainText(/^1 of \d+ Listening tests? completed/);
  await expect(cards.filter({ hasText: titles.free })).toContainText(`Taken 1 time · best band ${band}`);
  await expect(cards.filter({ hasText: titles.free }).getByRole("link", { name: /Take again/ })).toBeVisible();
  const history = page.getByRole("region", { name: "Your attempts" });
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText("1 correct · exam mode");

  // Reopen: the results as after submitting, transcripts included.
  await history.getByRole("link").click();
  await expect(page).toHaveURL(/\/app\/listening\/attempts\/[0-9a-f-]{36}$/);
  const attemptUrl = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(titles.free);
  await expect(page.getByTestId("band")).toHaveText(band);
  await expect(page.getByTestId("raw-score")).toHaveText("1 of 2 correct");
  await expect(page.getByTestId("listening-results")).toContainText("Exam mode");
  await expect(page.locator('[data-q="2"]')).toContainText("Correct answer: the guide");
  await page.getByTestId("transcript-1").getByText("Transcript", { exact: true }).click();
  await expect(page.getByTestId("transcript-1")).toContainText("Home transcript of part 1.");
  await expect(page.getByRole("region", { name: "Your attempts at this test" }).getByRole("link", { name: /exam mode/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Take this test again" })).toHaveAttribute("href", `/app/listening/${ids.free}`);

  // Someone else: 404, not the transcripts.
  const other = await student("Omar Other");
  await context.clearCookies();
  await context.addCookies(other.cookies.map((c) => ({ ...c, url: baseURL! })));
  await page.goto(attemptUrl);
  await expect(page.getByRole("heading", { name: /This page isn.t here/ })).toBeVisible();
  expect(await page.content()).not.toContain("Home transcript");
});

test("a Gold test opened on Free: the upgrade card, with a way back", async ({ page, context, baseURL }) => {
  const me = await student("Gia Free");
  await context.addCookies(me.cookies.map((c) => ({ ...c, url: baseURL! })));
  await page.goto(`/app/listening/${ids.gold}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This test is part of Gold");
  await page.getByRole("link", { name: "All Listening tests" }).click();
  await expect(page).toHaveURL(/\/app\/listening$/);
});
