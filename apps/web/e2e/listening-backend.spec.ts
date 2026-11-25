import { expect, test } from "@playwright/test";
import { ListeningGradeResponse, ListeningTestPayload } from "@prepora/shared/api/listening-test";
import { R2UploadResponse } from "@prepora/shared/api/r2-upload";
import { listeningBand } from "@prepora/shared/ielts/listening";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M5-B1..B3 through the real API and the local edge runtime:
//   * B2: get_listening_test (no answers or transcripts) → grade-test with module "listening" →
//     results, Listening band, transcripts only now, attempt saved with its mode; plan, draft,
//     input and allowance errors.
//   * B1: r2-upload-url: staff get a presigned PUT for R2; students and bad input are refused.
//     The edge runtime needs R2 settings (CI writes placeholders; locally pass an env file).
//   * B3: staff upload a map image to the public listening-images bucket; students can't; SVG
//     is refused.
// Needs the Edge Functions: skipped locally without them, fails in CI.

const { url, publishableKey } = localSupabase();
const fn = (name: string, token: string | null, body: unknown) =>
  fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe("Listening backend", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");

  let student: TestUser;
  let editor: TestUser;
  const tests: Record<"free" | "gold" | "draft", string> = { free: "", gold: "", draft: "" };

  test.beforeAll(async () => {
    let up = false;
    try {
      up = (await fetch(`${url}/functions/v1/health`, { signal: AbortSignal.timeout(5_000) })).ok;
    } catch {
      up = false;
    }
    if (!up && process.env.CI) throw new Error("Edge Functions are not running");
    test.skip(!up, "Edge Functions not running: start them with `supabase functions serve`");

    [student, editor] = await Promise.all([createTestUser("Lior Listener"), createTestUser("Edda Editor", "content_editor")]);
    const db = adminClient();
    for (const kind of ["free", "gold", "draft"] as const) {
      const { data: t } = await db
        .from("listening_tests")
        .insert({ title: `E2E listening ${kind} ${Date.now()}`, min_plan: kind === "gold" ? "gold" : "free" })
        .select("id")
        .single();
      tests[kind] = t!.id;
      const { data: sections } = await db
        .from("listening_sections")
        .insert(
          [1, 2, 3, 4].map((n) => ({
            test_id: t!.id,
            order_no: n,
            title: `Part ${n}`,
            audio_url: `https://audio.e2e.invalid/${n}.mp3`,
            duration_sec: 240,
            transcript: `Transcript of part ${n}: the café is opposite the entrance.`,
          })),
        )
        .select("id, order_no");
      const s1 = sections!.find((s) => s.order_no === 1)!.id;
      const image = { image_url: "https://cdn.e2e.invalid/plan.png", image_alt: "Plan of the centre" };
      const { error } = await db.from("listening_questions").insert([
        { test_id: t!.id, section_id: s1, q_no: 1, q_type: "note_table_completion", prompt: "Price: £___", options: { max_words: 1, number_allowed: true }, answer: { accept: ["12"] }, explanation: "Twelve pounds." },
        { test_id: t!.id, section_id: s1, q_no: 2, q_type: "map_labelling", prompt: "Café", options: { ...image, locations: [{ label: "A", x: 10, y: 10 }, { label: "B", x: 50, y: 50 }, { label: "C", x: 80, y: 20 }] }, answer: { label: "C" }, explanation: "Opposite the entrance." },
        { test_id: t!.id, section_id: s1, q_no: 3, q_type: "diagram_labelling", prompt: "Part X", options: { ...image, marker: { x: 30, y: 60 }, max_words: 2, number_allowed: false }, answer: { accept: ["filter"] }, explanation: null },
        { test_id: t!.id, section_id: s1, q_no: 4, q_type: "mcq", prompt: "Open on?", options: { choices: ["Mon", "Tue", "Wed"], select: 1 }, answer: { labels: ["A"] }, explanation: null },
      ]);
      if (error) throw error;
      if (kind !== "draft") {
        const { error: pError } = await db.from("listening_tests").update({ status: "published" }).eq("id", t!.id);
        if (pError) throw pError;
      }
    }
  });

  test.afterAll(async () => {
    const db = adminClient();
    const ids = Object.values(tests).filter(Boolean);
    if (ids.length) {
      await db.from("test_attempts").delete().in("test_id", ids);
      await db.from("listening_tests").update({ status: "archived" }).in("id", ids);
      await db.from("listening_tests").delete().in("id", ids);
    }
    await db.storage.from("listening-images").remove([`e2e/${editor?.id}.png`]);
    await Promise.all([deleteTestUser(student), deleteTestUser(editor)]);
  });

  test("M5-B2: load without answers → grade in practice mode → Listening band, transcripts, attempt saved", async () => {
    // What the player loads: audio and questions, nothing that gives answers away.
    const loaded = await student.client.rpc("get_listening_test", { p_test_id: tests.free });
    expect(loaded.error).toBeNull();
    const payload = ListeningTestPayload.parse(loaded.data);
    expect(payload.sections.map((s) => s.order_no)).toEqual([1, 2, 3, 4]);
    expect(payload.questions.map((q) => q.q_type)).toEqual(["note_table_completion", "map_labelling", "diagram_labelling", "mcq"]);
    expect(JSON.stringify(loaded.data)).not.toMatch(/"answer"|"explanation"|"transcript"|opposite the entrance/i);

    // 3 of 4 right (the map, the diagram, the price; wrong MCQ).
    const res = await fn("grade-test", student.accessToken, {
      module: "listening",
      test_id: tests.free,
      mode: "practice",
      answers: { "1": "12", "2": "c", "3": "Filter", "4": ["B"] },
      time_taken_sec: 1500,
    });
    expect(res.status).toBe(200);
    const body = ListeningGradeResponse.parse(await res.json());
    expect(body).toMatchObject({ module: "listening", mode: "practice", raw_score: 3, total: 4, band: listeningBand(3, 4) });
    expect(body.results.map((r) => [r.q_no, r.correct])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, false],
    ]);
    expect(body.results[1]).toMatchObject({ q_type: "map_labelling", correct_answer: "C", explanation: "Opposite the entrance." });
    expect(body.transcripts.map((t) => t.order_no)).toEqual([1, 2, 3, 4]);
    expect(body.transcripts[0]!.transcript).toContain("opposite the entrance");
    expect(body.allowance).toEqual({ type: "listening_tests", used: 1, limit: 2 });

    // Saved, with its mode and results, readable by the student.
    const attempt = await student.client.from("test_attempts").select("module, mode, raw_score, band, results").eq("id", body.attempt_id).single();
    expect(attempt.data).toMatchObject({ module: "listening", mode: "practice", raw_score: 3, band: listeningBand(3, 4) });
    expect((attempt.data?.results as unknown[]).length).toBe(4);
  });

  test("M5-B2: Gold → 403, draft → 404, no mode → 400, third test this month → 402", async () => {
    const send = (body: Record<string, unknown>) => fn("grade-test", student.accessToken, { module: "listening", mode: "exam", answers: {}, ...body });
    const gold = await send({ test_id: tests.gold });
    expect(gold.status).toBe(403);
    expect(await gold.json()).toMatchObject({ error: { code: "forbidden", details: { min_plan: "gold" } } });
    expect((await send({ test_id: tests.draft })).status).toBe(404);
    expect((await fn("grade-test", student.accessToken, { module: "listening", test_id: tests.free, answers: {} })).status).toBe(400);

    // Free has 2 Listening tests a month; the first test used one.
    expect((await send({ test_id: tests.free })).status).toBe(200);
    const over = await send({ test_id: tests.free });
    expect(over.status).toBe(402);
    expect(await over.json()).toMatchObject({ error: { code: "allowance_exceeded", details: { type: "listening_tests", used: 2, limit: 2 } } });
    // Reading still works as before (its own allowance).
    expect((await fn("grade-test", student.accessToken, { module: "reading", test_id: "5eed0000-0000-4000-8000-00000000000b", answers: {} })).status).toBe(200);
  });

  test("M5-B1: r2-upload-url gives staff a presigned PUT; others are refused", async () => {
    const ask = { test_id: tests.draft, section: 2, content_type: "audio/mpeg", size_bytes: 4_000_000 };
    const res = await fn("r2-upload-url", editor.accessToken, ask);
    if (res.status === 503 && !process.env.CI) test.skip(true, "R2 settings not given to the local edge runtime (see docs/r2.md)");
    expect(res.status).toBe(200);
    const body = R2UploadResponse.parse(await res.json());
    expect(body.key).toMatch(new RegExp(`^listening/${tests.draft}/section-2-[0-9a-f-]{36}\\.mp3$`));
    const u = new URL(body.upload_url);
    expect(u.host).toMatch(/\.r2\.cloudflarestorage\.com$/);
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(body.headers).toEqual({ "Content-Type": "audio/mpeg" });
    expect(body.public_url.endsWith(`/${body.key}`)).toBe(true);

    expect((await fn("r2-upload-url", student.accessToken, ask)).status).toBe(403);
    expect((await fn("r2-upload-url", null, ask)).status).toBe(401);
    expect((await fn("r2-upload-url", editor.accessToken, { ...ask, content_type: "video/mp4" })).status).toBe(400);
    expect((await fn("r2-upload-url", editor.accessToken, { ...ask, size_bytes: 200 * 1024 * 1024 })).status).toBe(400);
    expect((await fn("r2-upload-url", editor.accessToken, { ...ask, test_id: "00000000-0000-4000-8000-0000000000ff" })).status).toBe(404);
  });

  test("M5-B3: staff upload map images to the public bucket; students and SVG can't", async () => {
    const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
    if (!storageUp && process.env.CI) throw new Error("Storage is not running");
    test.skip(!storageUp, "Local Supabase is running without Storage");
    const path = `e2e/${editor.id}.png`;
    const up = await editor.client.storage.from("listening-images").upload(path, PNG, { contentType: "image/png", upsert: true });
    expect(up.error).toBeNull();
    const { data } = editor.client.storage.from("listening-images").getPublicUrl(path);
    const served = await fetch(data.publicUrl);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toContain("image/png");

    const svg = await editor.client.storage.from("listening-images").upload(`e2e/${editor.id}.svg`, "<svg/>", { contentType: "image/svg+xml" });
    expect(svg.error).not.toBeNull();
    const byStudent = await student.client.storage.from("listening-images").upload(`e2e/${student.id}.png`, PNG, { contentType: "image/png" });
    expect(byStudent.error).not.toBeNull();
  });
});
