import { expect, test } from "@playwright/test";
import { AdminListeningTest, listeningPublishCheck, listeningQuestionOrder } from "@prepora/shared/api/admin-listening";
import { ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M5-A1: the Listening builder's database calls through the real API (PostgREST) with real
// sessions, as the admin panel makes them: an editor builds a test (4 sections with audio and
// transcripts, questions numbered within their sections), reads keys and transcripts back,
// reorders and publishes; a student can't read keys or transcripts, before or after.

test.describe("Listening builder API", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  let testId: string | undefined;

  test.beforeAll(async () => {
    [editor, student] = await Promise.all([createTestUser("Edda Editor", "content_editor"), createTestUser("Sam Student")]);
  });

  test.afterAll(async () => {
    if (testId) {
      await adminClient().from("listening_tests").update({ status: "archived" }).eq("id", testId);
      await adminClient().from("listening_tests").delete().eq("id", testId);
    }
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an editor builds, reorders and publishes; a student never sees keys or transcripts", async () => {
    const db = editor.client;
    const created = await db.from("listening_tests").insert({ title: `E2E listening builder ${Date.now()}`, created_by: editor.id }).select("id").single();
    expect(created.error).toBeNull();
    testId = created.data!.id;
    const sections = await db
      .from("listening_sections")
      .insert(
        [1, 2, 3, 4].map((n) => ({
          test_id: testId!,
          order_no: n,
          title: `Part ${n}`,
          audio_url: `https://audio.prepora.site/listening/${testId}/section-${n}.mp3`,
          duration_sec: 300,
          transcript: `SECRET transcript ${n}`,
        })),
      )
      .select("id, order_no");
    expect(sections.error).toBeNull();
    const s1 = sections.data!.find((s) => s.order_no === 1)!.id;
    for (const [q_no, prompt, value] of [
      [1, "First", "true"],
      [2, "Second", "false"],
    ] as const) {
      const { error } = await db
        .from("listening_questions")
        .insert({ test_id: testId, section_id: s1, q_no, q_type: "tfng", prompt, options: {}, answer: { value }, explanation: "SECRET explanation" });
      expect(error).toBeNull();
    }

    let loaded = AdminListeningTest.parse((await db.rpc("admin_get_listening_test", { p_test_id: testId })).data);
    expect(loaded.sections.map((s) => s.transcript)).toEqual([1, 2, 3, 4].map((n) => `SECRET transcript ${n}`));
    expect(loaded.questions.map((q) => q.answer)).toEqual([{ value: "true" }, { value: "false" }]);
    expect(listeningPublishCheck(loaded).blocking).toEqual([]);

    // Move question 2 up.
    const order = listeningQuestionOrder(loaded.questions, loaded.sections).reverse();
    expect((await db.rpc("admin_order_listening_questions", { p_test_id: testId, p_ids: order })).error).toBeNull();
    loaded = AdminListeningTest.parse((await db.rpc("admin_get_listening_test", { p_test_id: testId })).data);
    expect(loaded.questions.map((q) => q.prompt)).toEqual(["Second", "First"]);

    // A student: no keys, no transcripts, no reordering, no draft.
    expect((await student.client.rpc("admin_get_listening_test", { p_test_id: testId })).error?.code).toBe("42501");
    expect((await student.client.rpc("admin_order_listening_questions", { p_test_id: testId, p_ids: order })).error?.code).toBe("42501");
    expect((await student.client.rpc("get_listening_test", { p_test_id: testId })).error?.code).toBe("PT404");

    expect((await db.from("listening_tests").update({ status: "published" }).eq("id", testId)).error).toBeNull();
    const res = await student.client.rpc("get_listening_test", { p_test_id: testId });
    expect(ListeningTestPayload.parse(res.data).questions).toHaveLength(2);
    expect(JSON.stringify(res.data)).not.toContain("SECRET");
  });
});
