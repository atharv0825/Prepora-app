import { expect, test } from "@playwright/test";
import { AdminReadingTest, publishCheck, questionOrder } from "@prepora/shared/api/admin-reading";
import { ReadingTestPayload } from "@prepora/shared/api/reading-test";
import type { Json } from "@prepora/shared/db";
import { parseReadingQuestion, type ReadingQuestionType } from "@prepora/shared/ielts/reading";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M4-A1: the Reading builder's database calls through the real API (PostgREST) with real
// sessions, as the admin panel makes them: a content editor creates a test, 3 passages and
// questions, reads the answer keys back, renumbers, and publishes; a student can't do any of it
// and still never sees a key.

test.describe("Reading builder API", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  let testId: string | undefined;

  test.beforeAll(async () => {
    [editor, student] = await Promise.all([createTestUser("Edie Editor", "content_editor"), createTestUser("Sam Student")]);
  });

  test.afterAll(async () => {
    if (testId) {
      await adminClient().from("reading_tests").update({ status: "archived" }).eq("id", testId);
      await adminClient().from("reading_tests").delete().eq("id", testId);
    }
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an editor builds, renumbers and publishes a test; a student can't read keys or edit", async () => {
    const db = editor.client;
    const created = await db
      .from("reading_tests")
      .insert({ title: `E2E builder ${Date.now()}`, test_type: "academic", min_plan: "free", source: "admin", created_by: editor.id })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    testId = created.data!.id;

    const passages = await db
      .from("reading_passages")
      .insert([1, 2, 3].map((n) => ({ test_id: testId!, order_no: n, title: `Passage ${n}`, body: `## Part ${n}\n\nA  Some **text**.` })))
      .select("id, order_no");
    expect(passages.error).toBeNull();
    const p = (n: number) => passages.data!.find((x) => x.order_no === n)!.id;

    // Questions as the builder saves them: valid for their type, added at the end, then renumbered.
    type Content = { passage: number; q_type: ReadingQuestionType; prompt: string; options: { [k: string]: Json }; answer: Json; explanation: string | null };
    const content: Content[] = [
      { passage: 1, q_type: "tfng", prompt: "Bees like roofs.", options: {}, answer: { value: "true" }, explanation: "Paragraph A says so." },
      { passage: 2, q_type: "mcq", prompt: "Pick two.", options: { choices: ["a", "b", "c"], select: 2 }, answer: { labels: ["A", "C"] }, explanation: "B is wrong." },
      { passage: 1, q_type: "short_answer", prompt: "Who?", options: { max_words: 2, number_allowed: false }, answer: { accept: ["the mayor"] }, explanation: null },
    ];
    for (const [i, c] of content.entries()) {
      expect(parseReadingQuestion(c).success).toBe(true);
      const { error } = await db.from("reading_questions").insert({
        test_id: testId,
        passage_id: p(c.passage),
        q_no: i + 1,
        q_type: c.q_type,
        prompt: c.prompt,
        options: c.options,
        answer: c.answer,
        explanation: c.explanation,
      });
      expect(error).toBeNull();
    }

    // The editor reads everything back, keys included.
    let loaded = AdminReadingTest.parse((await db.rpc("admin_get_reading_test", { p_test_id: testId })).data);
    expect(loaded.questions.map((q) => q.answer)).toEqual(content.map((c) => c.answer));
    // Passage 1's second question is numbered 3, after passage 2's: not publishable yet.
    expect(publishCheck(loaded).blocking).toContain("Questions aren't numbered in passage order. Reorder them.");

    const order = questionOrder(loaded.questions, loaded.passages);
    expect((await db.rpc("admin_order_reading_questions", { p_test_id: testId, p_ids: order })).error).toBeNull();
    loaded = AdminReadingTest.parse((await db.rpc("admin_get_reading_test", { p_test_id: testId })).data);
    expect(loaded.questions.map((q) => q.prompt)).toEqual(["Bees like roofs.", "Who?", "Pick two."]);
    expect(publishCheck(loaded).blocking).toEqual([]);

    // A student: no keys, no renumbering, no edits, and the draft is invisible.
    const keys = await student.client.rpc("admin_get_reading_test", { p_test_id: testId });
    expect(keys.error?.code).toBe("42501");
    const reorder = await student.client.rpc("admin_order_reading_questions", { p_test_id: testId, p_ids: order });
    expect(reorder.error?.code).toBe("42501");
    const edit = await student.client.from("reading_tests").update({ status: "published" }).eq("id", testId).select("id");
    expect(edit.data ?? []).toEqual([]);
    expect((await student.client.rpc("get_reading_test", { p_test_id: testId })).error?.code).toBe("PT404");

    // Publish (the database checks 3 passages and numbering again).
    const published = await db.from("reading_tests").update({ status: "published" }).eq("id", testId).select("status, published_at").single();
    expect(published.error).toBeNull();
    expect(published.data?.published_at).not.toBeNull();

    // The student now opens it, formatted passages included, and still sees no answer.
    const res = await student.client.rpc("get_reading_test", { p_test_id: testId });
    const payload = ReadingTestPayload.parse(res.data);
    expect(payload.passages[0]!.body).toBe("## Part 1\n\nA  Some **text**.");
    expect(JSON.stringify(res.data)).not.toMatch(/"answer"|"explanation"|Paragraph A says so/);
  });
});
