import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { AdminListeningTest, listeningPublishCheck } from "@prepora/shared/api/admin-listening";
import { AudioJob, GenerateAudioResponse } from "@prepora/shared/api/listening-audio";
import { checkImported, parseReadingDraft } from "../../admin/src/lib/reading-import";
import { mp3Info } from "../../../supabase/functions/_shared/listening_tts";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// Listening builder: audio generated from the transcript (generate-listening-audio) and "Import
// questions", end to end through the real API with real sessions. Text-to-speech is the ai-stub
// (silent MP3 frames, GOOGLE_TTS_API_URL) and the audio goes to a Storage bucket standing in for
// R2 (LISTENING_AUDIO_STORE=supabase-storage), as CI configures the edge runtime: no Google or R2
// call. Paste a transcript → generate → play it back → same transcript is cached → delete →
// regenerate → a changed transcript needs confirmation → import questions → the saved count.

const { url, publishableKey } = localSupabase();
const fn = (token: string | null, body: unknown) =>
  fetch(`${url}/functions/v1/generate-listening-audio`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const TRANSCRIPT = `You will hear a woman phoning a hotel.
Man: Good morning, Riverside Hotel. How can I help?
Woman: Hi, I'd like to book a room for two nights, please.
Man: Certainly. Could I have your name?
Woman: It's Sarah Jones.`;
const SAMPLE = readFileSync(join(__dirname, "../../admin/src/lib/fixtures/listening-import-sample.txt"), "utf8");

test.describe("Listening audio generation and question import", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let editor: TestUser;
  let student: TestUser;
  let testId: string | undefined;

  test.beforeAll(async () => {
    const res = await fn(null, {}).catch(() => null);
    const up = !!res && res.status !== 404 && res.status !== 502 && res.status !== 503;
    if (!up && process.env.CI) throw new Error("generate-listening-audio isn't running");
    test.skip(!up, "Edge Functions not running with the TTS stub (see the e2e workflow's functions env)");
    [editor, student] = await Promise.all([createTestUser("Audrey Audio", "content_editor"), createTestUser("Sam Student")]);
  });

  test.afterAll(async () => {
    if (testId) {
      // Remove the stored audio, then the test.
      if (editor) await fn(editor.accessToken, { action: "delete", test_id: testId, order_no: 1 }).catch(() => undefined);
      await adminClient().from("listening_tests").delete().eq("id", testId);
    }
    await Promise.all([deleteTestUser(editor), deleteTestUser(student)]);
  });

  const load = async () => {
    const { data, error } = await editor.client.rpc("admin_get_listening_test", { p_test_id: testId! });
    expect(error).toBeNull();
    return AdminListeningTest.parse(data);
  };

  const waitForJob = async (jobId: string) => {
    let job: AudioJob | null = null;
    await expect
      .poll(
        async () => {
          const { data } = await editor.client.from("listening_audio_jobs").select("id, status, chars, requests, audio_url, error, created_at, finished_at").eq("id", jobId).single();
          job = AudioJob.parse(data);
          return job.status;
        },
        { timeout: 60_000, intervals: [500, 1000] },
      )
      .not.toBe("running");
    return job as unknown as AudioJob;
  };

  test("generate, play back, cache, delete, regenerate; then import a section's questions", async () => {
    const db = editor.client;
    const created = await db.from("listening_tests").insert({ created_by: editor.id }).select("id").single();
    expect(created.error).toBeNull();
    testId = created.data!.id;
    const section = await db.from("listening_sections").insert({ test_id: testId, order_no: 1, title: "A hotel booking", transcript: TRANSCRIPT }).select("id").single();
    expect(section.error).toBeNull();

    // Staff only.
    expect((await fn(student.accessToken, { action: "generate", test_id: testId, order_no: 1 })).status).toBe(403);
    expect((await fn(null, { action: "generate", test_id: testId, order_no: 1 })).status).toBe(401);

    // Generate: runs in the background; the job reports back.
    const started = GenerateAudioResponse.parse(await (await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1 })).json());
    expect(started.status).toBe("started");
    if (started.status !== "started") return;
    expect(started.chars).toBeGreaterThan(100);
    const job = await waitForJob(started.job_id);
    expect(job.status, job.error ?? "").toBe("succeeded");

    let s = (await load()).sections[0]!;
    expect(s).toMatchObject({ audio_source: "generated", audio_chars: started.chars, audio_url: job.audio_url });
    expect(s.audio_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.duration_sec).toBeGreaterThanOrEqual(1);
    expect((await load()).tts_chars_used).toBe(started.chars);

    // Play it back: an MP3 at the saved URL.
    const audio = await fetch(s.audio_url!);
    expect(audio.status).toBe(200);
    expect(audio.headers.get("content-type")).toContain("audio/mpeg");
    expect(mp3Info(new Uint8Array(await audio.arrayBuffer())).frames).toBeGreaterThan(30);

    // Same transcript and voices: the saved audio, no TTS call, no new characters.
    const again = GenerateAudioResponse.parse(await (await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1 })).json());
    expect(again).toMatchObject({ status: "cached", chars: 0, audio_url: s.audio_url });
    expect((await load()).tts_chars_used).toBe(started.chars);

    // Delete: the file goes, the transcript stays.
    const deleted = await fn(editor.accessToken, { action: "delete", test_id: testId, order_no: 1 });
    expect(deleted.status).toBe(200);
    s = (await load()).sections[0]!;
    expect(s).toMatchObject({ audio_url: null, audio_source: null, audio_hash: null, transcript: TRANSCRIPT });
    expect((await fetch(job.audio_url!)).ok).toBe(false);

    // Regenerate.
    const re = GenerateAudioResponse.parse(await (await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1 })).json());
    expect(re.status).toBe("started");
    if (re.status !== "started") return;
    expect((await waitForJob(re.job_id)).status).toBe("succeeded");
    const first = (await load()).sections[0]!;
    expect(first.audio_source).toBe("generated");

    // A changed transcript: replacing the audio needs the admin's confirmation.
    await db.from("listening_sections").update({ transcript: `${TRANSCRIPT}\nMan: Thank you, Ms Jones.` }).eq("id", section.data!.id);
    const unconfirmed = await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1 });
    expect(unconfirmed.status).toBe(409);
    expect(((await unconfirmed.json()) as { error: { details?: { reason?: string } } }).error.details?.reason).toBe("needs_confirmation");
    const replaced = GenerateAudioResponse.parse(await (await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1, replace: true })).json());
    if (replaced.status !== "started") throw new Error(`expected a new generation, got ${replaced.status}`);
    expect((await waitForJob(replaced.job_id)).status).toBe("succeeded");
    const second = (await load()).sections[0]!;
    expect(second.audio_hash).not.toBe(first.audio_hash);
    expect((await fetch(first.audio_url!)).ok).toBe(false); // the old file is removed

    // A conversation without speaker labels is refused.
    await db.from("listening_sections").update({ transcript: "Hello and welcome to the hotel." }).eq("id", section.data!.id);
    expect((await fn(editor.accessToken, { action: "generate", test_id: testId, order_no: 1, replace: true })).status).toBe(400);

    // Import the section's questions, as the preview does: parse → check → save in one transaction.
    const parsed = parseReadingDraft(SAMPLE, { module: "listening" });
    const checked = parsed.questions.map((item) => ({ item, ...checkImported(item, "listening") }));
    expect(checked.filter((c) => c.error)).toEqual([]);
    const { data: imported, error } = await db.rpc("admin_import_listening_questions", {
      p_test_id: testId,
      p_order_no: 1,
      p_mode: "append",
      p_questions: checked.map(({ item, content }) => ({ ...content!, explanation: item.explanation || null })) as never,
    });
    expect(error).toBeNull();
    expect(imported).toMatchObject({ questions_imported: 10, section_total: 10 });
    const after = await load();
    expect(after.questions.map((q) => q.q_no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Map questions wait for their picture: they block publishing until it's added.
    expect(listeningPublishCheck(after).blocking).toContain("Question 9 (Map / plan labelling): add its picture.");

    // Students can't import, and still can't read the answers.
    const { error: studentImport } = await student.client.rpc("admin_import_listening_questions", { p_test_id: testId, p_order_no: 1, p_mode: "append", p_questions: [] });
    expect(studentImport?.code).toBe("42501");
  });
});
