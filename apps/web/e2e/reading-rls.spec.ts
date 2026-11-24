import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@prepora/shared/db";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M4-C1: the Reading tables through the real API (PostgREST) with real sessions. The answer key
// (reading_questions.answer, .explanation) must never come back to a student, whatever they ask
// for; Gold tests' content stays closed on Free; drafts are invisible.

test.describe("reading content RLS", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let student: TestUser;
  const ids: string[] = [];

  /** A complete published test (3 passages, 2 questions) made with the service role. */
  async function makeTest(title: string, minPlan: "free" | "gold", status: "published" | "draft") {
    const db = adminClient();
    const { data: t, error } = await db.from("reading_tests").insert({ test_type: "academic", title, min_plan: minPlan }).select("id").single();
    if (error) throw error;
    ids.push(t.id);
    const { data: passages } = await db
      .from("reading_passages")
      .insert([1, 2, 3].map((n) => ({ test_id: t.id, order_no: n, title: `P${n}`, body: `Body ${n}` })))
      .select("id, order_no");
    const p1 = passages!.find((p) => p.order_no === 1)!.id;
    const q = await db.from("reading_questions").insert([
      { test_id: t.id, passage_id: p1, q_no: 1, q_type: "tfng" as const, prompt: "Q1", options: {}, answer: "true", explanation: "Because" },
      { test_id: t.id, passage_id: p1, q_no: 2, q_type: "mcq" as const, prompt: "Q2", options: { choices: ["A", "B"] }, answer: "B" },
    ]);
    if (q.error) throw q.error;
    if (status === "published") {
      const pub = await db.from("reading_tests").update({ status: "published" }).eq("id", t.id);
      if (pub.error) throw pub.error;
    }
    return t.id;
  }

  let freeTest: string, goldTest: string, draftTest: string;

  test.beforeAll(async () => {
    student = await createTestUser("Reading Student");
    freeTest = await makeTest("E2E Free test", "free", "published");
    goldTest = await makeTest("E2E Gold test", "gold", "published");
    draftTest = await makeTest("E2E Draft test", "free", "draft");
  });

  test.afterAll(async () => {
    await adminClient().from("reading_tests").update({ status: "archived" }).in("id", ids);
    await adminClient().from("reading_tests").delete().in("id", ids);
    await deleteTestUser(student);
  });

  test("a Free student reads a Free test's questions, never the answers", async () => {
    const ok = await student.client.from("reading_questions").select("q_no, q_type, prompt, options").eq("test_id", freeTest).order("q_no");
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([
      { q_no: 1, q_type: "tfng", prompt: "Q1", options: {} },
      { q_no: 2, q_type: "mcq", prompt: "Q2", options: { choices: ["A", "B"] } },
    ]);

    for (const columns of ["*", "answer", "explanation", "q_no, answer"]) {
      const res = await student.client.from("reading_questions").select(columns).eq("test_id", freeTest);
      expect(res.data, `select=${columns}`).toBeNull();
      expect(res.error?.code, `select=${columns}`).toBe("42501");
    }
    // Filtering or ordering by the answer would leak it bit by bit: refused too.
    const probe = await student.client.from("reading_questions").select("q_no").eq("test_id", freeTest).eq("answer", '"B"');
    expect(probe.error?.code).toBe("42501");
  });

  test("Gold content is closed on Free; drafts are invisible", async () => {
    const list = await student.client.from("reading_tests").select("id, title, min_plan").in("id", ids);
    expect(list.data?.map((t) => t.title).sort()).toEqual(["E2E Free test", "E2E Gold test"]);

    const gold = await student.client.from("reading_passages").select("id").eq("test_id", goldTest);
    expect(gold.data).toEqual([]);
    const draft = await student.client.from("reading_questions").select("id").eq("test_id", draftTest);
    expect(draft.data).toEqual([]);
  });

  test("signed out: the published list only", async () => {
    const { url, publishableKey } = localSupabase();
    const anon = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
    const list = await anon.from("reading_tests").select("title").in("id", ids);
    expect(list.data?.map((t) => t.title).sort()).toEqual(["E2E Free test", "E2E Gold test"]);
    expect((await anon.from("reading_passages").select("id").eq("test_id", freeTest)).error).not.toBeNull();
  });
});
