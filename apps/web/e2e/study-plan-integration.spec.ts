import { type BrowserContext, expect, test } from "@playwright/test";
import { MyStudyPlan, NextPick } from "@prepora/shared/api/study-plan";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M8.7-I1, against the real database functions (pick_next, assign_my_study_plan,
// get_my_study_plan) and the app:
//   * random picks never return a done item (until everything is done) or a locked one
//   * the assigned plan is stable across reloads and never shows other templates
//   * completing real practice ticks the plan's item
//   * "Start a new plan" gives a different template
//
// Practice is recorded as the grading functions record it (a test_attempts row), so this needs no
// AI. Content here is our own: two Free Academic Reading tests and one Gold one, all published.

test.skip(({ isMobile }) => isMobile, "data rules: the desktop project covers them");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const made: string[] = [];
let users: TestUser[] = [];
let freeA = "";
let freeB = "";
let gold = "";

/** A complete published Academic Reading test (3 passages, 2 questions), made with the service role. */
async function makeReadingTest(title: string, minPlan: "free" | "gold") {
  const db = adminClient();
  const { data: t, error } = await db.from("reading_tests").insert({ test_type: "academic", title, min_plan: minPlan }).select("id").single();
  if (error) throw error;
  made.push(t.id);
  const { data: passages, error: pError } = await db
    .from("reading_passages")
    .insert([1, 2, 3].map((n) => ({ test_id: t.id, order_no: n, title: `P${n}`, body: `Body ${n}` })))
    .select("id, order_no");
  if (pError) throw pError;
  const p1 = passages.find((p) => p.order_no === 1)!.id;
  const q = await db.from("reading_questions").insert([
    { test_id: t.id, passage_id: p1, q_no: 1, q_type: "tfng" as const, prompt: "Q1", options: {}, answer: "true", explanation: "Because" },
    { test_id: t.id, passage_id: p1, q_no: 2, q_type: "mcq" as const, prompt: "Q2", options: { choices: ["A", "B"] }, answer: "B" },
  ]);
  if (q.error) throw q.error;
  const pub = await db.from("reading_tests").update({ status: "published" }).eq("id", t.id);
  if (pub.error) throw pub.error;
  return t.id;
}

/** A Free Academic student (onboarded, UTC), signed in to the browser if a context is given. */
async function student(name: string, context?: BrowserContext, baseURL?: string) {
  const u = await createTestUser(name, "user", { test_type: "academic", target_band: 7, timezone: "UTC" });
  users.push(u);
  if (context) await context.addCookies(u.cookies.map((c) => ({ ...c, url: baseURL! })));
  return u;
}

/** Real practice of a Reading test, as grade-test records it. */
async function didReading(userId: string, testIds: string[]) {
  const { error } = await adminClient()
    .from("test_attempts")
    .insert(testIds.map((test_id) => ({ user_id: userId, module: "reading" as const, test_id, raw_score: 30, band: 7 })));
  if (error) throw error;
}

async function pick(u: TestUser, exclude: string[] = []) {
  const { data, error } = await u.client.rpc("pick_next", { p_kind: "reading_test", p_exclude: exclude });
  expect(error).toBeNull();
  return NextPick.parse(data);
}

test.beforeAll(async () => {
  freeA = await makeReadingTest(`E2E plan A ${stamp}`, "free");
  freeB = await makeReadingTest(`E2E plan B ${stamp}`, "free");
  gold = await makeReadingTest(`E2E plan Gold ${stamp}`, "gold");
});

test.afterAll(async () => {
  for (const u of users) await deleteTestUser(u);
  users = [];
  const db = adminClient();
  await db.from("reading_tests").update({ status: "archived" }).in("id", made);
  await db.from("reading_tests").delete().in("id", made);
});

test("random picks: never a locked item, never a done one until all are done", async ({ page, context, baseURL }) => {
  const me = await student("Rae Random", context, baseURL);
  const db = adminClient();

  // Nothing done: many picks, never the Gold test (the student is Free).
  for (let i = 0; i < 15; i++) {
    const p = await pick(me);
    expect(p).not.toBeNull();
    expect(p!.item_id).not.toBe(gold);
    expect(p!.done_before).toBe(false);
  }

  // Everything this student could take is done except test A.
  const { data: open } = await db.from("reading_tests").select("id").eq("status", "published").eq("test_type", "academic").eq("min_plan", "free");
  const done = open!.map((t) => t.id).filter((id) => id !== freeA);
  expect(done).toContain(freeB);
  await didReading(me.id, done);

  // Every pick is a test not done yet (test A, unless another one was published meanwhile).
  for (let i = 0; i < 10; i++) {
    const p = await pick(me);
    expect(done).not.toContain(p!.item_id);
    expect(p!.item_id).not.toBe(gold);
    expect(p!.done_before).toBe(false);
  }
  // Never the same item twice in a row (M8.7-B1) comes before "not done": with A just picked
  // (excluded), the next pick is another test, never A and never Gold.
  const next = await pick(me, [freeA]);
  expect(next!.item_id).not.toBe(freeA);
  expect(next!.item_id).not.toBe(gold);
  // "Pick for me" in the app opens a test not done either.
  await page.goto("/app/pick/reading_test");
  await expect(page).toHaveURL(/\/app\/reading\/[0-9a-f-]{36}$/);
  const opened = page.url().split("/").pop()!;
  expect(done).not.toContain(opened);
  expect(opened).not.toBe(gold);

  // All done: a pick is still given (the one done longest ago, not A, done last), marked as done
  // before, never Gold. (A test another spec published meanwhile is not done: it comes first.)
  await didReading(me.id, [freeA]);
  const again = await pick(me);
  expect(again).not.toBeNull();
  expect(again!.item_id).not.toBe(gold);
  expect(again!.item_id).not.toBe(freeA);
  if (done.includes(again!.item_id)) expect(again!.done_before).toBe(true);
  else expect(again!.done_before).toBe(false);
});

test("the plan is stable across reloads and never shows a template", async ({ page, context, baseURL }) => {
  const me = await student("Sam Stable", context, baseURL);
  const db = adminClient();
  const { data: templates } = await db.from("study_plan_templates").select("id, name");
  expect(templates?.length).toBeGreaterThan(1);

  await page.goto("/app/plan");
  await page.getByRole("button", { name: "Get my study plan" }).click();
  await expect(page.getByTestId("plan-day")).toContainText(/^Day 1 of \d+/);
  const day = await page.getByTestId("plan-day").textContent();
  const items = await page.getByTestId("plan-item").allTextContents();
  expect(items.length).toBeGreaterThan(0);
  const { data: assigned } = await db.from("user_study_plans").select("id, template_id").eq("user_id", me.id).eq("status", "active");
  expect(assigned).toHaveLength(1);

  // Reloads (and a fresh RPC call): the same plan, the same picks.
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByTestId("plan-day")).toHaveText(day!);
    expect(await page.getByTestId("plan-item").allTextContents()).toEqual(items);
  }
  const { data: again } = await db.from("user_study_plans").select("id, template_id").eq("user_id", me.id).eq("status", "active");
  expect(again).toEqual(assigned);

  // Nothing about any template reaches the student: not on the page, not in the RPC's answer,
  // and the template tables are closed to them.
  const main = (await page.getByRole("main").textContent()) ?? "";
  for (const t of templates!) expect(main).not.toContain(t.name);
  const { data: plan, error } = await me.client.rpc("get_my_study_plan");
  expect(error).toBeNull();
  MyStudyPlan.parse(plan);
  const raw = JSON.stringify(plan);
  for (const t of templates!) {
    expect(raw).not.toContain(t.id);
    expect(raw).not.toContain(t.name);
  }
  expect((await me.client.from("study_plan_templates").select("id")).data).toEqual([]);
  expect((await me.client.from("study_plan_items").select("template_id")).data).toEqual([]);
});

test("completing real practice ticks the plan's item", async ({ page, context, baseURL }) => {
  const me = await student("Tia Ticks", context, baseURL);
  const db = adminClient();
  // A plan whose first day has a Reading test (set directly, so the day is known).
  const { data: firsts } = await db.from("study_plan_items").select("template_id, study_plan_templates!inner(active, test_type, replaced_by)").eq("day", 1).eq("kind", "reading_test");
  const template = firsts!.find((r) => {
    const t = r.study_plan_templates as unknown as { active: boolean; test_type: string | null; replaced_by: string | null };
    return t.active && !t.replaced_by && (t.test_type === null || t.test_type === "academic");
  })?.template_id;
  expect(template, "an active template with a Reading test on day 1").toBeTruthy();
  const { error } = await db.from("user_study_plans").insert({ user_id: me.id, template_id: template!, started_on: new Date().toISOString().slice(0, 10) });
  expect(error).toBeNull();

  await page.goto("/app/plan");
  const reading = page.getByTestId("plan-item").filter({ hasText: "Reading test" }).first();
  await expect(reading).not.toHaveAttribute("data-done", "true");
  const href = await reading.getByRole("link", { name: /^Start/ }).getAttribute("href");
  const testId = href!.match(/\/app\/reading\/([0-9a-f-]{36})$/)![1]!;
  await expect(page.getByTestId("plan-progress")).toContainText(/^0 of \d+/);

  // The student takes that test.
  await didReading(me.id, [testId]);

  await page.reload();
  const ticked = page.getByTestId("plan-item").filter({ hasText: "Reading test" }).first();
  await expect(ticked).toHaveAttribute("data-done", "true");
  await expect(ticked).toContainText("Done");
  await expect(page.getByTestId("plan-progress")).toContainText(/^1 of \d+/);
  const { data: plan } = await me.client.rpc("get_my_study_plan");
  const parsed = MyStudyPlan.parse(plan);
  expect(parsed.active && parsed.items.find((i) => i.item_id === testId)?.done).toBe(true);
});

test("Start a new plan gives a different template", async ({ page, context, baseURL }) => {
  const me = await student("Uma Anew", context, baseURL);
  const db = adminClient();
  const { count } = await db
    .from("study_plan_templates")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .or("test_type.is.null,test_type.eq.academic");
  expect(count, "at least two active templates for Academic students").toBeGreaterThan(1);

  await page.goto("/app/plan");
  await page.getByRole("button", { name: "Get my study plan" }).click();
  await expect(page.getByTestId("plan-day")).toContainText(/^Day 1 of \d+/);
  const current = async () => (await db.from("user_study_plans").select("id, template_id").eq("user_id", me.id).eq("status", "active").single()).data!;
  let before = await current();

  page.on("dialog", (d) => d.accept());
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Start a new plan" }).click();
    await expect(page.getByText("You have a new study plan.")).toBeVisible();
    const after = await current();
    expect(after.id).not.toBe(before.id);
    expect(after.template_id).not.toBe(before.template_id);
    const { data: old } = await db.from("user_study_plans").select("status").eq("id", before.id).single();
    expect(old!.status).toBe("restarted");
    before = after;
    await page.reload();
  }
  // Still one active plan.
  const { count: active } = await db.from("user_study_plans").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("status", "active");
  expect(active).toBe(1);
});
