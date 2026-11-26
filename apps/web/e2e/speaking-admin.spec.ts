import { expect, test } from "@playwright/test";
import { CueCardForm, cueCardRow, Part3Form, part3Row, speakingPublishCheck } from "@prepora/shared/api/admin-speaking";
import { adminClient, createTestUser, deleteTestUser, type TestUser } from "./support/local-supabase";

// M7-A1: the Speaking topic manager's calls through the real API (PostgREST) with real sessions, as
// the admin panel's Server Functions make them: an editor creates a cue card and a linked Part 3
// discussion from the form contract; the Part 3 can't be published before its card; a student sees
// only published topics and can't write any; a card with a linked discussion or answers can't be
// deleted, only archived.

test.describe("Speaking topic manager API (M7-A1)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  const ids: string[] = [];

  test.beforeAll(async () => {
    [editor, student] = await Promise.all([createTestUser("Eve Editor", "content_editor"), createTestUser("Sid Student")]);
  });

  test.afterAll(async () => {
    const db = adminClient();
    await db.from("speaking_sessions").delete().eq("user_id", student.id);
    // Part 3 first (it points at the card).
    for (const id of [...ids].reverse()) {
      await db.from("speaking_topics").update({ status: "archived" }).eq("id", id);
      await db.from("speaking_topics").delete().eq("id", id);
    }
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  test("an editor builds a cue card and its Part 3; publishing order; students read, can't write", async () => {
    const db = editor.client;
    const card = CueCardForm.parse({ title: `Describe a festival you enjoyed ${Date.now()}`, points: ["what it was", "", "when it happened", "who you went with", "and explain why you enjoyed it"] });
    const created = await db.from("speaking_topics").insert({ ...cueCardRow(card), created_by: editor.id }).select("id, part, title, cue_card_points, questions").single();
    expect(created.error).toBeNull();
    expect(created.data!.cue_card_points).toEqual(["what it was", "when it happened", "who you went with", "and explain why you enjoyed it"]);
    const cardId = created.data!.id;
    ids.push(cardId);
    expect(speakingPublishCheck(created.data!)).toEqual({ blocking: [], warnings: [] });

    const p3 = Part3Form.parse({ title: "Festivals and culture", questions: ["Why are festivals important?", "Are traditions disappearing?", "Should governments fund festivals?", "How will festivals change?"], parent_topic_id: cardId });
    const disc = await db.from("speaking_topics").insert({ ...part3Row(p3), created_by: editor.id }).select("id").single();
    expect(disc.error).toBeNull();
    const discId = disc.data!.id;
    ids.push(discId);

    // The discussion waits for its card: the checklist and the database agree.
    expect(speakingPublishCheck({ ...part3Row(p3), parent_status: "draft" }).blocking).toEqual(["Publish its Part 2 cue card first."]);
    expect((await db.from("speaking_topics").update({ status: "published" }).eq("id", discId)).error?.code).toBe("23514");
    expect((await db.from("speaking_topics").update({ status: "published" }).eq("id", cardId)).error).toBeNull();
    expect((await db.from("speaking_topics").update({ status: "published" }).eq("id", discId)).error).toBeNull();

    // Students: both published topics are readable; they can't add or change any.
    const seen = await student.client.from("speaking_topics").select("id, part, parent_topic_id").in("id", [cardId, discId]).order("part");
    expect(seen.data).toEqual([
      { id: cardId, part: 2, parent_topic_id: null },
      { id: discId, part: 3, parent_topic_id: cardId },
    ]);
    expect((await student.client.from("speaking_topics").insert(cueCardRow(card))).error?.code).toBe("42501");
    expect((await student.client.from("speaking_topics").update({ title: "Hacked" }).eq("id", cardId).select("id")).data).toEqual([]);

    // A card with a linked discussion can't be deleted (even as a draft): archive it.
    expect((await db.from("speaking_topics").update({ status: "draft" }).eq("id", cardId)).error).toBeNull();
    expect((await db.from("speaking_topics").delete().eq("id", cardId)).error?.code).toBe("23503");
    expect((await db.from("speaking_topics").update({ status: "archived" }).eq("id", cardId)).error).toBeNull();
    expect((await student.client.from("speaking_topics").select("id").eq("id", cardId)).data).toEqual([]);
  });

  test("a card students have answered can't be deleted", async () => {
    const db = editor.client;
    const card = await db
      .from("speaking_topics")
      .insert({ ...cueCardRow(CueCardForm.parse({ title: `Describe a book ${Date.now()}`, points: ["what it is", "and why"] })), status: "published" })
      .select("id")
      .single();
    const cardId = card.data!.id;
    ids.push(cardId);
    const session = crypto.randomUUID();
    await adminClient().from("speaking_sessions").insert({ id: session, user_id: student.id, mode: "part2" });
    await adminClient().from("speaking_responses").insert({
      session_id: session, user_id: student.id, topic_id: cardId, part: 2, transcript: "I like this book.",
      scores: { fc: 5, lr: 5, gra: 5, pron: 6 }, band: 5, feedback: { detail: "summary", summary: "Short.", better_phrases_count: 0 },
    });
    expect((await db.from("speaking_topics").update({ status: "draft" }).eq("id", cardId)).error).toBeNull();
    expect((await db.from("speaking_topics").delete().eq("id", cardId)).error?.code).toBe("23503");
  });
});
