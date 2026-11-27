import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { AdminReadingTest, publishCheck } from "@prepora/shared/api/admin-reading";
import { parseReadingQuestion } from "@prepora/shared/ielts/reading";
import { contentFromDraft } from "../../admin/src/lib/reading-builder";
import { draftFromImported, parseReadingDraft } from "../../admin/src/lib/reading-import";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// Reading builder import, end to end through the real API with real sessions: the sample draft
// (3 passages, 40 questions, 11 types) is parsed and previewed exactly as the admin's Import
// panel does (parseReadingDraft → draftFromImported → contentFromDraft, checked with the shared
// contract), imported through admin_import_reading_content, and read back. A student can't import
// and still can't read the answer keys.

const SAMPLE = readFileSync(join(__dirname, "../../admin/src/lib/fixtures/reading-import-sample.md"), "utf8");

test.describe("Reading import API", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  let testId: string | undefined;

  test.beforeAll(async () => {
    [editor, student] = await Promise.all([createTestUser("Edie Editor", "content_editor"), createTestUser("Sam Student")]);
  });

  test.afterAll(async () => {
    if (testId) await adminClient().from("reading_tests").delete().eq("id", testId);
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an editor pastes the sample, previews and imports it: 3 passages, 40 questions, ready to publish", async () => {
    const db = editor.client;
    const created = await db
      .from("reading_tests")
      .insert({ title: `E2E import ${Date.now()}`, test_type: "academic", min_plan: "free", source: "admin", created_by: editor.id })
      .select("id")
      .single();
    expect(created.error).toBeNull();
    testId = created.data!.id;

    // Preview: what the panel shows before anything is saved.
    const preview = parseReadingDraft(SAMPLE, { testType: "academic" });
    expect(preview.passages).toHaveLength(3);
    expect(preview.questions).toHaveLength(40);
    expect(preview.warnings.map((w) => w.kind).sort()).toEqual(["builder_note", "builder_note", "needs_image"]);
    const questions = preview.questions.map((q) => ({ passage_order_no: q.passage, ...contentFromDraft(draftFromImported(q)), explanation: q.explanation || null }));
    for (const q of questions) expect(parseReadingQuestion(q).success).toBe(true);
    // Nothing saved by previewing.
    expect((await db.from("reading_passages").select("id").eq("test_id", testId)).data).toHaveLength(0);

    // A student can't import.
    const refused = await student.client.rpc("admin_import_reading_content", {
      p_test_id: testId,
      p_mode: "append",
      p_passages: preview.passages.map(({ order_no, title, body }) => ({ order_no, title, body })),
      p_questions: questions as never,
    });
    expect(refused.error?.code).toBe("42501");

    // Import.
    const imported = await db.rpc("admin_import_reading_content", {
      p_test_id: testId,
      p_mode: "append",
      p_passages: preview.passages.map(({ order_no, title, body }) => ({ order_no, title, body })),
      p_questions: questions as never,
    });
    expect(imported.error).toBeNull();
    expect(imported.data).toMatchObject({ passages_created: 3, questions_imported: 40, questions_total: 40 });

    // Read back as the builder does.
    const loaded = AdminReadingTest.parse((await db.rpc("admin_get_reading_test", { p_test_id: testId })).data);
    expect(loaded.passages.map((p) => [p.order_no, p.title])).toEqual([
      [1, "The Glassmakers of Murano"],
      [2, "Sleep and the Teenage Brain"],
      [3, "Urban Beekeeping"],
    ]);
    const sorted = [...loaded.questions].sort((a, b) => a.q_no - b.q_no);
    expect(sorted.map((q) => q.q_no)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(new Set(sorted.map((q) => q.q_type)).size).toBe(11);
    const passageOf = new Map(loaded.passages.map((p) => [p.id, p.order_no]));
    expect(sorted.filter((q) => passageOf.get(q.passage_id) === 2).map((q) => q.q_no)).toEqual(Array.from({ length: 13 }, (_, i) => i + 14));
    expect(sorted[0]).toMatchObject({ q_type: "mcq", answer: { labels: ["B"] } });
    expect(sorted[4]).toMatchObject({ q_type: "tfng", answer: { value: "true" } });
    expect(publishCheck(loaded).blocking).toEqual([]);

    // Importing again needs a choice: replace swaps the questions, the count stays 40.
    const again = await db.rpc("admin_import_reading_content", { p_test_id: testId, p_mode: "replace", p_passages: [], p_questions: questions as never });
    expect(again.data).toMatchObject({ questions_imported: 40, questions_total: 40 });
    const tooMany = await db.rpc("admin_import_reading_content", { p_test_id: testId, p_mode: "append", p_passages: [], p_questions: questions.slice(0, 1) as never });
    expect(tooMany.error?.code).toBe("22023");

    // Students never read keys directly.
    const keys = await student.client.from("reading_questions").select("answer").eq("test_id", testId);
    expect(keys.error).not.toBeNull();
  });
});
