import { expect, test } from "@playwright/test";
import { parseListeningQuestion } from "@prepora/shared/ielts/listening";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";
import { createClient } from "@supabase/supabase-js";

// M5-C1 through the real API (PostgREST) with real sessions: a Free student reads a published
// Listening test's sections (with audio) and questions (with options), but never the transcript,
// the answers or the explanations; Gold and draft content stay hidden; signed out, the list only.
// The test is built with the service role, its questions checked against the M5-C2 contract.

test.describe("Listening RLS", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let student: TestUser;
  const ids: string[] = [];

  test.beforeAll(async () => {
    student = await createTestUser("Lena Listener");
    const db = adminClient();
    for (const [title, min_plan] of [
      ["E2E Listening Free", "free"],
      ["E2E Listening Gold", "gold"],
      ["E2E Listening Draft", "free"],
    ] as const) {
      const { data: t, error } = await db.from("listening_tests").insert({ title: `${title} ${Date.now()}`, min_plan }).select("id").single();
      if (error) throw error;
      ids.push(t.id);
      const { data: sections } = await db
        .from("listening_sections")
        .insert(
          [1, 2, 3, 4].map((n) => ({
            test_id: t.id,
            order_no: n,
            title: `Part ${n}`,
            audio_url: `https://audio.prepora.test/${t.id}/${n}.mp3`,
            duration_sec: 300,
            transcript: `SECRET transcript ${n}`,
          })),
        )
        .select("id, order_no");
      const questions = [
        { q_no: 1, q_type: "note_table_completion" as const, prompt: "Cost: £___", options: { max_words: 1, number_allowed: true }, answer: { accept: ["25"] } },
        {
          q_no: 3,
          q_type: "map_labelling" as const,
          prompt: "Library",
          options: { image_url: "https://cdn.prepora.test/map.png", image_alt: "Campus", locations: [{ label: "A", x: 10, y: 10 }, { label: "B", x: 60, y: 40 }] },
          answer: { label: "B" },
        },
      ];
      for (const q of questions) expect(parseListeningQuestion(q).success).toBe(true);
      // Numbered 1..N for publishing, all in section 1 (questions 1–10).
      const all = [...questions, { q_no: 2, q_type: "tfng" as const, prompt: "Free entry.", options: {}, answer: { value: "true" } }];
      const sectionFor = (qNo: number) => sections!.find((s) => s.order_no === Math.ceil(qNo / 10))!.id;
      const { error: qError } = await db.from("listening_questions").insert(
        all.map((q) => ({ ...q, test_id: t.id, section_id: sectionFor(q.q_no), explanation: "SECRET explanation" })),
      );
      if (qError) throw qError;
      if (title !== "E2E Listening Draft") {
        const { error: pError } = await db.from("listening_tests").update({ status: "published" }).eq("id", t.id);
        if (pError) throw pError;
      }
    }
  });

  test.afterAll(async () => {
    const db = adminClient();
    await db.from("listening_tests").update({ status: "archived" }).in("id", ids);
    await db.from("listening_tests").delete().in("id", ids);
    await deleteTestUser(student);
  });

  test("a Free student reads audio and questions, never transcripts or answers", async () => {
    const [free, gold, draft] = ids;
    const c = student.client;

    const sections = await c.from("listening_sections").select("order_no, title, audio_url, duration_sec").eq("test_id", free!).order("order_no");
    expect(sections.error).toBeNull();
    expect(sections.data?.map((s) => s.order_no)).toEqual([1, 2, 3, 4]);
    expect(sections.data?.[0]?.audio_url).toMatch(/^https:\/\//);
    const questions = await c.from("listening_questions").select("q_no, q_type, prompt, options").eq("test_id", free!).order("q_no");
    expect(questions.data?.map((q) => q.q_no)).toEqual([1, 2, 3]);
    expect(questions.data?.[2]?.options).toMatchObject({ image_alt: "Campus" });

    // Closed columns: 42501 however they're asked for.
    for (const res of [
      await c.from("listening_sections").select("transcript").eq("test_id", free!),
      await c.from("listening_sections").select("*").eq("test_id", free!),
      await c.from("listening_questions").select("answer").eq("test_id", free!),
      await c.from("listening_questions").select("explanation").eq("test_id", free!),
      await c.from("listening_questions").select("q_no").eq("test_id", free!).eq("answer->>value", "true"),
    ]) {
      expect(res.error?.code).toBe("42501");
    }

    // Gold content and drafts: no rows. The Gold test is still listed (to upsell); the draft isn't.
    expect((await c.from("listening_sections").select("id").eq("test_id", gold!)).data).toEqual([]);
    expect((await c.from("listening_questions").select("id").eq("test_id", draft!)).data).toEqual([]);
    const listed = (await c.from("listening_tests").select("id").in("id", ids)).data?.map((t) => t.id);
    expect(listed?.sort()).toEqual([free!, gold!].sort());

    // Students can't write.
    expect((await c.from("listening_tests").insert({ title: "Mine" })).error?.code).toBe("42501");

    // Signed out: the list only.
    const { url, publishableKey } = localSupabase();
    const anon = createClient(url, publishableKey, { auth: { persistSession: false } });
    expect(((await anon.from("listening_tests").select("id").in("id", ids)).data ?? []).length).toBe(2);
    expect((await anon.from("listening_sections").select("id").eq("test_id", free!)).error?.code).toBe("42501");
  });
});
