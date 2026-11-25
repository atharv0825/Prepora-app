import { expect, test, type Response } from "@playwright/test";
import { readingBand } from "@prepora/shared/ielts/bands";
import { ONBOARDED, adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";
import { answer, key, pressSubmit } from "./support/reading";

// M4-I1: a student takes the seeded General Training sample (M4-C3) in the browser, from the test
// list to the results, and gets the band the General table gives for their score. Every response
// the browser receives before submitting (pages, RSC payloads, API calls) is checked for the
// answer key: no answer or explanation fields, and none of the test's explanation texts (except
// those that only quote the passage word for word). After
// submitting, the grade-test response does carry them (so the check would catch a leak).
// Needs the local Edge Functions, like grade-test.spec.ts: skipped locally without them, fails in CI.

const { url } = localSupabase();
const GENERAL = "5eed0000-0000-4000-8000-00000000000b";
const KEY_FIELDS = ['"answer":', '"explanation":', '"accept":', '"correct_answer":'];

let user: TestUser | undefined;

test.beforeAll(async () => {
  let up = false;
  try {
    up = (await fetch(`${url}/functions/v1/health`, { signal: AbortSignal.timeout(5_000) })).ok;
  } catch {
    up = false;
  }
  if (!up && process.env.CI) throw new Error("Edge Functions are not running");
  test.skip(!up, "Edge Functions not running: start them with `supabase functions serve`");
});

test.afterEach(async () => {
  await deleteTestUser(user);
  user = undefined;
});

test("M4-I1: take the General sample → submit → the right band; no answers reach the browser before submitting", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(120_000);
  user = await createTestUser("Ines Integration", "user", { ...ONBOARDED, test_type: "general", timezone: "UTC" });
  await context.addCookies(user.cookies.map((c) => ({ ...c, url: baseURL! })));

  const answers = await key(GENERAL);
  const db = adminClient();
  const [{ data: explained }, { data: passages }] = await Promise.all([
    db.from("reading_questions").select("explanation").eq("test_id", GENERAL),
    db.from("reading_passages").select("body").eq("test_id", GENERAL),
  ]);
  const explanations = (explained ?? []).map((q) => q.explanation).filter((e): e is string => !!e && e.length >= 15);
  expect(explanations.length).toBe(answers.size);
  // An explanation that only quotes the passage is on the page anyway; look for the others.
  const secret = explanations.filter((e) => !(passages ?? []).some((p) => p.body.includes(e)));
  expect(secret.length).toBeGreaterThanOrEqual(10);

  // Everything the browser loads that could carry data: documents, RSC payloads, API calls.
  let submitted = false;
  const before: Promise<{ url: string; body: string }>[] = [];
  const after: Promise<{ url: string; body: string }>[] = [];
  page.on("response", (res: Response) => {
    if (!["document", "fetch", "xhr"].includes(res.request().resourceType())) return;
    const body = res.text().then(
      (text) => ({ url: res.url(), body: text }),
      () => ({ url: res.url(), body: "" }), // redirects and aborted requests have no body
    );
    (submitted ? after : before).push(body);
  });

  // From the list, like a student.
  await page.goto("/app/reading");
  await page.getByTestId("reading-test").filter({ hasText: "Sample General Training Test" }).getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/app/reading/${GENERAL}$`));
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByRole("navigation", { name: "Questions" }).getByRole("button")).toHaveCount(14);

  // Questions 1–10 right, 11–14 left blank: 10 of 14.
  for (let n = 1; n <= 10; n++) await answer(page, n, answers.get(n)!);
  await page.reload(); // the page is fetched again: also checked
  await page.getByRole("button", { name: "Start the test" }).click();
  await expect(page.getByText("Continued where you left off.")).toBeVisible();

  const leaks = (await Promise.all(before)).flatMap(({ url: u, body }) =>
    [...KEY_FIELDS, ...secret].filter((needle) => body.includes(needle)).map((needle) => `${u} contains ${needle.slice(0, 40)}`),
  );
  expect(leaks).toEqual([]);
  expect(before.length).toBeGreaterThan(2);

  submitted = true;
  const graded = page.waitForResponse((r) => r.url().includes("/functions/v1/grade-test"));
  await pressSubmit(page);
  await expect(page.getByRole("dialog")).toContainText("Submit with 4 unanswered?");
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  const response = await graded;
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { raw_score: number; total: number; band: number; results: { explanation: string | null }[] };

  // The band from the General Training table, scaled from 14 questions.
  const band = readingBand("general", 10, 14);
  expect(body).toMatchObject({ raw_score: 10, total: 14, band });
  // Only now do the explanations arrive.
  expect(body.results.map((r) => r.explanation)).toEqual(expect.arrayContaining(explanations));

  await expect(page).toHaveURL(/\/app\/reading\/attempts\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  await expect(page.getByTestId("raw-score")).toHaveText("10 of 14 correct");
  await expect(page.getByTestId("band")).toHaveText(band.toFixed(1));
  await expect(page.getByText(explanations[0]!).first()).toBeVisible();
});
