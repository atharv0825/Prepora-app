import { expect, test } from "@playwright/test";
import { GradeTestResponse } from "@prepora/shared/api/grade-test";
import { ReadingTestPayload } from "@prepora/shared/api/reading-test";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M4-B1 + M4-B2 through the real API: get_reading_test (PostgREST) and the grade-test Edge
// Function (local edge runtime), with real sessions, on the seeded sample tests (M4-C3).
// Needs the local Edge Functions (see credits-edge.spec.ts): skipped locally without them,
// fails in CI.

const { url, publishableKey } = localSupabase();
const ACADEMIC = "5eed0000-0000-4000-8000-00000000000a";
const GENERAL = "5eed0000-0000-4000-8000-00000000000b";

async function functionsUp(): Promise<boolean> {
  try {
    return (await fetch(`${url}/functions/v1/health`, { signal: AbortSignal.timeout(5_000) })).ok;
  } catch {
    return false;
  }
}

async function grade(user: TestUser | null, body: unknown) {
  const res = await fetch(`${url}/functions/v1/grade-test`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function getTest(user: TestUser, testId: string) {
  const res = await fetch(`${url}/rest/v1/rpc/get_reading_test`, {
    method: "POST",
    headers: { apikey: publishableKey, authorization: `Bearer ${user.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ p_test_id: testId }),
  });
  return { status: res.status, text: await res.text() };
}

/** The right answer for each question, as the player would send it (read with the service role). */
async function correctAnswers(testId: string): Promise<Record<string, string | string[]>> {
  const { data } = await adminClient().from("reading_questions").select("q_no, answer").eq("test_id", testId);
  return Object.fromEntries(
    (data ?? []).map((q) => {
      const a = q.answer as { labels?: string[]; value?: string; label?: string; accept?: string[] };
      return [String(q.q_no), a.labels ?? a.value ?? a.label ?? a.accept![0]!];
    }),
  );
}

test.beforeAll(async () => {
  const up = await functionsUp();
  if (!up && process.env.CI) throw new Error("Edge Functions are not running (supabase start must include edge-runtime)");
  test.skip(!up, "Edge Functions not running: start them with `supabase functions serve`");
});

test.describe("get_reading_test + grade-test (API)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let student: TestUser;
  let goldTest: string;

  test.beforeAll(async () => {
    const db = adminClient();
    const { data: t } = await db.from("reading_tests").insert({ test_type: "academic", title: "E2E Gold grading", min_plan: "gold" }).select("id").single();
    goldTest = t!.id;
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
    await db.from("reading_tests").update({ status: "published" }).eq("id", goldTest);
  });

  test.afterAll(async () => {
    await adminClient().from("reading_tests").update({ status: "archived" }).eq("id", goldTest);
    await adminClient().from("reading_tests").delete().eq("id", goldTest);
  });

  test.beforeEach(async () => {
    student = await createTestUser("Reading Grader");
  });
  test.afterEach(async () => {
    await deleteTestUser(student);
  });

  test("M4-B1: the test as the player loads it has no answers anywhere in the response", async () => {
    const res = await getTest(student, ACADEMIC);
    expect(res.status).toBe(200);
    const payload = ReadingTestPayload.parse(JSON.parse(res.text));
    expect(payload.passages).toHaveLength(3);
    expect(payload.questions).toHaveLength(20);
    // The raw network body: no key fields, no explanation text, no accepted answer.
    for (const leak of ['"answer"', '"explanation"', '"accept"', '"labels"', "Paragraph D lists the steps", "accumulators stored"]) {
      expect(res.text).not.toContain(leak);
    }

    expect((await getTest(student, goldTest)).status).toBe(403);
    expect((await getTest(student, "00000000-0000-4000-8000-0000000000ff")).status).toBe(404);
  });

  test("M4-B2: all correct → band 9; results show answers and explanations; allowance counted", async () => {
    const res = await grade(student, { module: "reading", test_id: ACADEMIC, answers: await correctAnswers(ACADEMIC), time_taken_sec: 1500 });
    expect(res.status).toBe(200);
    const body = GradeTestResponse.parse(res.body);
    expect(body).toMatchObject({ raw_score: 20, total: 20, band: 9, allowance: { type: "reading_tests", used: 1, limit: 2 } });
    expect(body.results.every((r) => r.correct && r.explanation)).toBe(true);
    expect(body.results.find((r) => r.q_no === 20)).toMatchObject({ q_type: "mcq", correct_answer: ["A", "C"] });

    const { data: attempt } = await adminClient().from("test_attempts").select("user_id, module, raw_score, band, time_taken_sec").eq("id", body.attempt_id).single();
    expect(attempt).toEqual({ user_id: student.id, module: "reading", raw_score: 20, band: 9, time_taken_sec: 1500 });
    // M4-F4: the results are kept with the attempt for reviewing later.
    const { data: saved } = await student.client.from("test_attempts").select("results").eq("id", body.attempt_id).single();
    expect(saved!.results).toEqual(body.results);
    // The student reads their own attempt (RLS).
    expect((await student.client.from("test_attempts").select("band")).data).toEqual([{ band: 9 }]);
  });

  test("M4-B2: case, spelling and word limits on the General sample; band from the General table", async () => {
    const answers = await correctAnswers(GENERAL);
    answers["5"] = "FITNESS Classes."; // case and punctuation don't matter → right
    answers["6"] = "Facilites"; // misspelt → wrong
    answers["8"] = "your staff ID card"; // 4 words, limit 3 → wrong
    answers["1"] = "yes"; // a Yes/No answer to True/False → wrong
    delete answers["14"]; // unanswered → wrong
    const res = await grade(student, { module: "reading", test_id: GENERAL, answers });
    expect(res.status).toBe(200);
    const body = GradeTestResponse.parse(res.body);
    const byNo = Object.fromEntries(body.results.map((r) => [r.q_no, r]));
    expect(byNo[5]).toMatchObject({ correct: true });
    expect(byNo[6]).toMatchObject({ correct: false, correct_answer: "Facilities", also_accepted: ["Facilities team"] });
    expect(byNo[8]).toMatchObject({ correct: false, note: "over_word_limit" });
    expect(byNo[1]).toMatchObject({ correct: false, correct_answer: "true" });
    expect(byNo[14]).toMatchObject({ correct: false, given: null, note: "unanswered" });
    // 10/14 → 28/40 → General 5.5.
    expect(body).toMatchObject({ raw_score: 10, total: 14, band: 5.5 });
  });

  test("M4-B2: the Free allowance (2 a month) blocks the third test, and nothing is saved", async () => {
    for (let i = 0; i < 2; i++) expect((await grade(student, { module: "reading", test_id: ACADEMIC, answers: {} })).status).toBe(200);
    const third = await grade(student, { module: "reading", test_id: GENERAL, answers: {} });
    expect(third.status).toBe(402);
    expect(third.body).toMatchObject({ error: { code: "allowance_exceeded", details: { type: "reading_tests", used: 2, limit: 2 } } });
    const { count } = await adminClient().from("test_attempts").select("id", { count: "exact", head: true }).eq("user_id", student.id);
    expect(count).toBe(2);
  });

  test("M4-B2: refusals: plan, unknown test, no session, bad input", async () => {
    const gold = await grade(student, { module: "reading", test_id: goldTest, answers: { "1": "true" } });
    expect(gold.status).toBe(403);
    expect(gold.body).toMatchObject({ error: { code: "forbidden", details: { min_plan: "gold" } } });
    expect((await grade(student, { module: "reading", test_id: "00000000-0000-4000-8000-0000000000ff", answers: {} })).status).toBe(404);
    expect((await grade(null, { module: "reading", test_id: ACADEMIC, answers: {} })).status).toBe(401);
    // The score can't be sent in: unknown fields are refused.
    const cheat = await grade(student, { module: "reading", test_id: ACADEMIC, answers: {}, raw_score: 40, band: 9 });
    expect(cheat.status).toBe(400);
    expect((await grade(student, { module: "reading", test_id: ACADEMIC, answers: { "41": "x" } })).status).toBe(400);
    // None of these used the allowance.
    const { data } = await student.client.rpc("get_my_credits");
    expect((data as { allowances: { type: string; used: number }[] }).allowances.find((a) => a.type === "reading_tests")?.used).toBe(0);
  });
});
