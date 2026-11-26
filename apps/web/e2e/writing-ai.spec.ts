import { expect, test } from "@playwright/test";
import { ScoreWritingResponse } from "@prepora/shared/api/score-writing";
import { MOCK_TASK2_ESSAY } from "@prepora/shared/mocks/writing";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M6-B3/B4 through the real local Edge Functions: score-writing and ocr-writing.
//   * Always (CI too): sign-in, validation, 404 for unpublished tasks, other students' photos,
//     402 without credits, 403 for Free OCR. These fail before the AI call or before any credit.
//   * Without an AI key (CI): a valid answer gets a 500 with NO credits spent and nothing saved.
//   * With E2E_AI=1 (a laptop whose functions are served with DEEPSEEK_API_KEY, or the provider set
//     by AI_PROVIDER): real scoring, Gold gets the full feedback, Free the summary, and both are
//     saved and logged in ai_usage. Costs about US$0.01 on DeepSeek. No real AI calls in CI (M6-I1).
//     E2E_AI_MODEL: the model expected in ai_usage (default deepseek-flash).
// Needs the Edge Functions: skipped locally without them, fails in CI.

const { url, publishableKey } = localSupabase();
const realAi = process.env.E2E_AI === "1";
const expectedModel = process.env.E2E_AI_MODEL ?? "deepseek-flash";

async function call(fn: "score-writing" | "ocr-writing", user: TestUser | null, body: unknown) {
  const res = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

async function balance(user: TestUser): Promise<number> {
  const { data } = await user.client.rpc("get_my_credits");
  return (data as { balance: number }).balance;
}

test.describe("Writing AI functions (API)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");
  test.describe.configure({ mode: "serial" });

  const stamp = Math.random().toString(36).slice(2, 8);
  const tasks = { essay: "", letter: "", draft: "" };
  let free: TestUser;
  let gold: TestUser;

  test.beforeAll(async () => {
    let up = false;
    try {
      up = (await fetch(`${url}/functions/v1/score-writing`, { method: "OPTIONS", signal: AbortSignal.timeout(5_000) })).ok;
    } catch {
      up = false;
    }
    if (!up && process.env.CI) throw new Error("Edge Functions are not running");
    test.skip(!up, "Edge Functions not running (or started before score-writing existed): restart `supabase functions serve`");

    const db = adminClient();
    [free, gold] = await Promise.all([createTestUser("Wendy Free"), createTestUser("Gus Gold")]);
    await db.from("profiles").update({ plan: "gold" }).eq("id", gold.id);
    const { data, error } = await db
      .from("writing_tasks")
      .insert(
        [
          { task_no: 2, title: `E2E essay ${stamp}`, prompt: "Some people believe that working from home benefits both employees and employers. Others think it causes more problems than it solves. Discuss both views and give your own opinion.", status: "published" },
          { task_no: 1, test_type: "general", title: `E2E letter ${stamp}`, prompt: "Write a letter to your neighbour about noise.", status: "published" },
          { task_no: 2, title: `E2E draft ${stamp}`, prompt: "Draft.", status: "draft" },
        ],
        { defaultToNull: false },
      )
      .select("id, title");
    if (error) throw error;
    for (const t of data) {
      if (t.title.startsWith("E2E essay")) tasks.essay = t.id;
      else if (t.title.startsWith("E2E letter")) tasks.letter = t.id;
      else tasks.draft = t.id;
    }
  });

  test.afterAll(async () => {
    const db = adminClient();
    const ids = Object.values(tasks).filter(Boolean);
    if (ids.length) await db.from("writing_submissions").delete().in("task_id", ids);
    await Promise.all([free, gold].filter(Boolean).map((u) => deleteTestUser(u)));
    if (ids.length) {
      await db.from("writing_tasks").update({ status: "archived" }).in("id", ids);
      await db.from("writing_tasks").delete().in("id", ids);
    }
  });

  test("score-writing refuses bad requests before spending anything", async () => {
    const before = await balance(free);
    expect((await call("score-writing", null, { task_id: tasks.essay, text: "Essay" })).status).toBe(401);
    const empty = await call("score-writing", free, { task_id: tasks.essay, text: "   " });
    expect([empty.status, empty.body.error?.code]).toEqual([400, "validation_failed"]);
    expect((await call("score-writing", free, { task_id: tasks.essay, text: "x", input_mode: "photo" })).status).toBe(400);
    const theirs = await call("score-writing", free, { task_id: tasks.essay, text: "x", input_mode: "photo", photo_paths: [`${gold.id}/page1.jpg`] });
    expect([theirs.status, theirs.body.error?.code]).toEqual([400, "validation_failed"]);
    expect((await call("score-writing", free, { task_id: tasks.draft, text: "Essay" })).status).toBe(404);
    expect((await call("score-writing", free, { task_id: "00000000-0000-4000-8000-0000000000ff", text: "Essay" })).status).toBe(404);
    expect(await balance(free)).toBe(before);
  });

  test("ocr-writing: own folder only, Gold only, photos must exist", async () => {
    const theirs = await call("ocr-writing", gold, { photo_paths: [`${free.id}/page1.jpg`] });
    expect([theirs.status, theirs.body.error?.code]).toEqual([400, "validation_failed"]);
    const onFree = await call("ocr-writing", free, { photo_paths: [`${free.id}/page1.jpg`] });
    expect([onFree.status, onFree.body.error?.code]).toEqual([403, "feature_not_in_plan"]);
    const missing = await call("ocr-writing", gold, { photo_paths: [`${gold.id}/nothing-here.jpg`] });
    expect([missing.status, missing.body.error?.code]).toEqual([404, "not_found"]);
    expect((await call("ocr-writing", gold, { photo_paths: [] })).status).toBe(400);
  });

  test("no credits: 402 with the details the dialog needs", async () => {
    const db = adminClient();
    const broke = await createTestUser("Bea Broke");
    try {
      await db.from("credit_buckets").update({ remaining: 0 }).eq("user_id", broke.id);
      const r = await call("score-writing", broke, { task_id: tasks.essay, text: "My essay." });
      // Without a key the function stops before spending (500); with one, spend_credits refuses (402).
      if (realAi) {
        expect([r.status, r.body.error?.code]).toEqual([402, "insufficient_credits"]);
        expect(r.body.error).toMatchObject({ details: { action_key: "writing_t2", credits: 4 } });
      } else {
        expect(r.status).toBe(500);
      }
    } finally {
      await deleteTestUser(broke);
    }
  });

  test("without an AI key: 500, no credits spent, nothing saved", async () => {
    test.skip(realAi, "functions are served with an AI key");
    const before = await balance(free);
    const r = await call("score-writing", free, { task_id: tasks.essay, text: MOCK_TASK2_ESSAY });
    expect([r.status, r.body.error?.code]).toEqual([500, "internal"]);
    expect(await balance(free)).toBe(before);
    expect((await adminClient().from("writing_submissions").select("id").eq("user_id", free.id)).data).toEqual([]);
  });

  test("real AI: Gold gets the full feedback, Free the summary; saved and logged", async () => {
    test.skip(!realAi, "set E2E_AI=1 with functions served with DEEPSEEK_API_KEY (costs ~US$0.01)");
    test.setTimeout(240_000);
    const db = adminClient();
    const [goldBefore, freeBefore] = await Promise.all([balance(gold), balance(free)]);

    const g = await call("score-writing", gold, { task_id: tasks.essay, text: MOCK_TASK2_ESSAY, time_taken_sec: 2280 });
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const full = ScoreWritingResponse.parse(g.body);
    expect(full.detail).toBe("full");
    if (full.detail !== "full") return;
    expect(full).toMatchObject({ task_id: tasks.essay, task_no: 2, min_words: 250, credits_charged: 4, balance_after: goldBefore - 4 });
    expect(full.band).toBeGreaterThanOrEqual(4.5);
    expect(full.band).toBeLessThanOrEqual(7.5); // the sample essay is a band-6 script
    expect(full.corrections.length).toBeGreaterThan(0);
    for (const c of full.corrections) expect(MOCK_TASK2_ESSAY).toContain(c.original);
    console.log("Gold:", JSON.stringify({ band: full.band, scores: full.scores, corrections: full.corrections.length }));

    const f = await call("score-writing", free, { task_id: tasks.essay, text: MOCK_TASK2_ESSAY });
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    const summary = ScoreWritingResponse.parse(f.body);
    expect(summary.detail).toBe("summary");
    expect(summary).not.toHaveProperty("corrections");
    expect(summary).not.toHaveProperty("model_answer");
    expect(await balance(free)).toBe(freeBefore - 4);

    // Saved with the plan's shape and the prompt version; the student reads only their own.
    const { data: rows } = await db
      .from("writing_submissions")
      .select("id, user_id, band, feedback, prompt_version, input_mode, word_count, time_taken_sec")
      .in("user_id", [gold.id, free.id]);
    const goldRow = rows!.find((r) => r.user_id === gold.id)!;
    const freeRow = rows!.find((r) => r.user_id === free.id)!;
    expect(goldRow).toMatchObject({ id: full.submission_id, band: full.band, prompt_version: "t2-v1", input_mode: "typed", time_taken_sec: 2280 });
    expect((goldRow.feedback as { detail: string }).detail).toBe("full");
    expect(freeRow.feedback).toEqual({ detail: "summary", summary: summary.summary, corrections_count: (summary as { corrections_count: number }).corrections_count });
    expect((await free.client.from("writing_submissions").select("id")).data).toEqual([{ id: freeRow.id }]);

    // Real tokens and cost against the credits charged.
    const { data: usage } = await db.from("ai_usage").select("model, input_tokens, output_tokens, cost_usd, credits_charged, success").eq("user_id", gold.id);
    expect(usage).toHaveLength(1);
    expect(usage![0]).toMatchObject({ model: expectedModel, credits_charged: 4, success: true });
    expect(usage![0].input_tokens).toBeGreaterThan(1000);
    expect(Number(usage![0].cost_usd)).toBeGreaterThan(0);
    console.log("Usage:", JSON.stringify(usage![0]));
  });
});
