import { expect, test } from "@playwright/test";
import { ScoreSpeakingResponse } from "@prepora/shared/api/score-speaking";
import { adminClient, createTestUser, deleteTestUser, localSupabase, type TestUser } from "./support/local-supabase";

// M7-B3 through the real local Edge Function: score-speaking (Part 2).
//   * Always (CI too): sign-in, validation, another student's session or recording, a part the
//     session doesn't have, an unpublished topic, a missing recording, a file that isn't audio.
//     These fail before any credit is spent.
//   * With E2E_AI=1 E2E_AI_STUB=1 (CI: Groq and DeepSeek both point at the ai-stub function, so no
//     AI is called): the whole chain. Gold gets the full feedback, Free the summary; the session
//     completes with its band; ai_usage has the AI's tokens and Whisper's seconds; a part can't be
//     scored twice; a too-short recording is refused and refunded; an AI failure is refunded.
// Needs the Edge Functions and Storage: skipped locally without them, fails in CI.

const { url, publishableKey } = localSupabase();
const stubAi = process.env.E2E_AI === "1" && process.env.E2E_AI_STUB === "1";
// A few bytes with a WebM header: the function reads the container from the first bytes; the stub
// doesn't decode audio (real recordings: speaking-formats live test, M7-B4).
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
/** A WebM header followed by a marker the ai-stub reads in the audio bytes (STUB_SHORT, STUB_FAIL). */
const marked = (marker: string) => new Uint8Array([...WEBM, ...new TextEncoder().encode(marker)]);

async function call(user: TestUser | null, body: unknown) {
  const res = await fetch(`${url}/functions/v1/score-speaking`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json", ...(user ? { authorization: `Bearer ${user.accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string; message: string } } };
}

async function balance(user: TestUser): Promise<number> {
  const { data } = await user.client.rpc("get_my_credits");
  return (data as { balance: number }).balance;
}

test.describe("score-speaking (API)", () => {
  test.skip(({ browserName, isMobile }) => browserName !== "chromium" || isMobile, "API test: run once");
  test.describe.configure({ mode: "serial" });

  const topics = { card: "", draft: "" };
  let free: TestUser;
  let gold: TestUser;

  /** A Part 2 session of the student's own, and a recording uploaded to their folder. */
  async function prepare(u: TestUser, name = "answer.webm", bytes: Uint8Array = WEBM) {
    const session = crypto.randomUUID();
    const s = await u.client.from("speaking_sessions").insert({ id: session, user_id: u.id, mode: "part2" });
    expect(s.error).toBeNull();
    const path = `${u.id}/${crypto.randomUUID()}-${name}`;
    const up = await u.client.storage.from("speaking-audio").upload(path, bytes, { contentType: "audio/webm" });
    expect(up.error).toBeNull();
    return { session_id: session, topic_id: topics.card, part: 2, audio_path: path };
  }

  test.beforeAll(async () => {
    let up = false;
    try {
      up = (await fetch(`${url}/functions/v1/score-speaking`, { method: "OPTIONS", signal: AbortSignal.timeout(5_000) })).ok;
    } catch {
      up = false;
    }
    const storageUp = (await fetch(`${url}/storage/v1/version`).catch(() => null))?.ok ?? false;
    if ((!up || !storageUp) && process.env.CI) throw new Error("Edge Functions or Storage are not running");
    test.skip(!up || !storageUp, "needs the Edge Functions (restart `supabase functions serve` after adding score-speaking) and Storage");

    const db = adminClient();
    [free, gold] = await Promise.all([createTestUser("Sam Speaker"), createTestUser("Goldie Speaker")]);
    await db.from("profiles").update({ plan: "gold" }).eq("id", gold.id);
    const stamp = Date.now();
    const { data, error } = await db
      .from("speaking_topics")
      .insert(
        [
          { part: 2, title: `E2E describe a place ${stamp}`, cue_card_points: ["where it is", "how often you go", "what you do there", "and explain why"], status: "published" },
          { part: 2, title: `E2E draft card ${stamp}`, cue_card_points: ["a", "b"] },
        ],
        { defaultToNull: false },
      )
      .select("id, status");
    if (error) throw error;
    topics.card = data.find((t) => t.status === "published")!.id;
    topics.draft = data.find((t) => t.status !== "published")!.id;
  });

  test.afterAll(async () => {
    const db = adminClient();
    for (const u of [free, gold].filter(Boolean)) {
      const { data } = await db.storage.from("speaking-audio").list(u.id);
      if (data?.length) await db.storage.from("speaking-audio").remove(data.map((f) => `${u.id}/${f.name}`));
      await db.from("speaking_sessions").delete().eq("user_id", u.id); // responses go with them
    }
    await Promise.all([free, gold].filter(Boolean).map((u) => deleteTestUser(u)));
    const ids = Object.values(topics).filter(Boolean);
    if (ids.length) {
      await db.from("speaking_topics").update({ status: "archived" }).in("id", ids);
      await db.from("speaking_topics").delete().in("id", ids);
    }
  });

  test("refuses bad requests before spending anything", async () => {
    const before = await balance(free);
    const ok = await prepare(free);
    expect((await call(null, ok)).status).toBe(401);
    expect((await call(free, { ...ok, audio_path: "nope.webm" })).status).toBe(400);
    expect((await call(free, { ...ok, part: 1 })).status).toBe(400); // Parts 1 and 3 come with M8
    const other = await call(gold, ok); // Gold isn't the session's student
    expect([other.status, other.body.error?.code]).toEqual([404, "not_found"]);
    expect((await call(free, { ...ok, topic_id: topics.draft })).status).toBe(404);
    expect((await call(free, { ...ok, audio_path: `${free.id}/missing.webm` })).status).toBe(404);
    expect((await call(free, { ...ok, audio_path: `${gold.id}/theirs.webm` })).status).toBe(400);
    const notAudio = await prepare(free, "notes.webm", new TextEncoder().encode("%PDF-1.4 not audio"));
    const r = await call(free, notAudio);
    expect([r.status, r.body.error?.message]).toEqual([400, "Request validation failed"]);
    expect(await balance(free)).toBe(before);
  });

  test("stubbed AI: Gold full feedback, Free summary, session completed, usage with audio seconds", async () => {
    test.skip(!stubAi, "needs E2E_AI=1 E2E_AI_STUB=1 (Groq and DeepSeek pointed at the ai-stub)");
    const db = adminClient();
    const goldBefore = await balance(gold);
    const g = await call(gold, await prepare(gold));
    expect(g.status, JSON.stringify(g.body)).toBe(200);
    const full = ScoreSpeakingResponse.parse(g.body);
    if (full.detail !== "full") throw new Error("expected full");
    expect(full).toMatchObject({ part: 2, band: 6, credits_charged: 4, balance_after: goldBefore - 4 });
    expect(full.transcript).toContain("small beach near my hometown");
    expect(full.signals).toMatchObject({ pauses: 1, longest_pause_sec: 2.8, transcript_confidence: 0.89 });
    expect(full.fillers.map((f) => f.word).sort()).toEqual(["uh", "um", "you know"]);
    expect(full.better_phrases.map((p) => p.original)).toEqual(["very delicious", "feel very relax", "two or three times in a month"]);

    const f = await call(free, await prepare(free));
    expect(f.status, JSON.stringify(f.body)).toBe(200);
    const summary = ScoreSpeakingResponse.parse(f.body);
    expect(summary).toMatchObject({ detail: "summary", better_phrases_count: 3 });
    expect(summary).not.toHaveProperty("model_answer");

    const { data: sessions } = await db.from("speaking_sessions").select("status, part2_band, overall_band, completed_at").eq("id", full.session_id);
    expect(sessions![0]).toMatchObject({ status: "completed", part2_band: 6, overall_band: 6 });
    const { data: row } = await db.from("speaking_responses").select("prompt_version, audio_paths, feedback").eq("id", full.response_id).single();
    expect(row).toMatchObject({ prompt_version: "s2-v1" });
    expect((row!.feedback as { detail: string }).detail).toBe("full");
    const { data: usage } = await db.from("ai_usage").select("model, action_key, audio_seconds, input_tokens, cost_usd, success").eq("user_id", gold.id);
    expect(usage).toHaveLength(1);
    expect(usage![0]).toMatchObject({ model: "deepseek-flash", action_key: "speaking_p2", success: true });
    expect(Number(usage![0].audio_seconds)).toBeGreaterThan(60);
    expect(Number(usage![0].cost_usd)).toBeGreaterThan(0);

    // The same part of a finished session can't be scored again.
    const again = await call(gold, { ...(await prepare(gold)), session_id: full.session_id });
    expect(again.status).toBe(409);
  });

  test("stubbed AI: a too-short recording and an AI failure are refunded", async () => {
    test.skip(!stubAi, "needs E2E_AI=1 E2E_AI_STUB=1");
    const db = adminClient();
    const before = await balance(gold);
    const short = await call(gold, await prepare(gold, "short.webm", marked("STUB_SHORT")));
    expect([short.status, short.body.error?.code]).toEqual([400, "validation_failed"]);
    expect(short.body.error?.message).toContain("couldn't hear enough");
    const failed = await call(gold, await prepare(gold, "fail.webm", marked("STUB_FAIL")));
    expect([failed.status, failed.body.error?.code]).toEqual([500, "internal"]);
    expect(await balance(gold)).toBe(before);
    const { data: usage } = await db.from("ai_usage").select("success, audio_seconds").eq("user_id", gold.id).eq("success", false);
    expect(usage!.length).toBeGreaterThanOrEqual(2);
    expect(usage!.some((u) => Number(u.audio_seconds) > 0)).toBe(true); // the failed AI call still logs Whisper's seconds
  });
  test("stubbed AI: a full test — examiner turns, Parts 1 → 2 → 3 in order, 15 credits, the overall band", async () => {
    test.skip(!stubAi, "needs E2E_AI=1 E2E_AI_STUB=1");
    test.setTimeout(240_000);
    const db = adminClient();
    const stamp = Date.now();
    const { data: made, error } = await db
      .from("speaking_topics")
      .insert(
        [
          { part: 1, title: `E2E hometown ${stamp}`, questions: ["Where is your hometown?", "What do you like about it?", "Has it changed much?", "Would you live there in future?", "Do you often go back?"], status: "published" },
          { part: 3, title: `E2E places ${stamp}`, questions: ["Why do people travel?", "Is tourism good for local people?", "How will travel change?", "Should places limit visitors?"], parent_topic_id: topics.card, status: "published" },
        ],
        { defaultToNull: false },
      )
      .select("id, part");
    if (error) throw error;
    const p1 = made.find((t) => t.part === 1)!.id;
    const p3 = made.find((t) => t.part === 3)!.id;
    try {
      // A full test costs 15 and the earlier tests here already spent some of the 18 sign-up
      // credits: top the student up (Gold's daily cap, 40, still allows the day's 19).
      const { error: gError } = await db.rpc("grant_credits", { p_user_id: gold.id, p_source: "topup", p_amount: 20 });
      if (gError) throw gError;
      const before = await balance(gold);
      const session = crypto.randomUUID();
      expect((await gold.client.from("speaking_sessions").insert({ id: session, user_id: gold.id, mode: "full_test" })).error).toBeNull();
      const upload = async (name: string, bytes: Uint8Array = WEBM) => {
        const path = `${gold.id}/${session}-${name}.webm`;
        expect((await gold.client.storage.from("speaking-audio").upload(path, bytes, { contentType: "audio/webm" })).error).toBeNull();
        return path;
      };
      const turn = (part: 1 | 3, topic_id: string, turns: unknown[]) =>
        fetch(`${url}/functions/v1/examiner-turn`, {
          method: "POST",
          headers: { apikey: publishableKey, authorization: `Bearer ${gold.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ session_id: session, part, topic_id, turns }),
        }).then(async (r) => ({ status: r.status, body: (await r.json()) as Record<string, unknown> & { error?: { code: string } } }));

      /** Plays a part with the examiner: upload each answer, send it, take the next question. */
      async function converse(part: 1 | 3, topicId: string, followUpOn?: number) {
        const turns: { question: string; audio_path?: string; transcript?: string }[] = [];
        let r = await turn(part, topicId, []);
        expect(r.status, JSON.stringify(r.body)).toBe(200);
        expect(r.body).toMatchObject({ transcribed: null, source: "set", question_no: 1, done: false });
        for (let i = 0; !r.body.done && i < 8; i++) {
          const marker = followUpOn === i ? marked("STUB_FOLLOW_UP") : WEBM;
          turns.push({ question: r.body.next_question as string, audio_path: await upload(`p${part}-q${i + 1}`, marker) });
          r = await turn(part, topicId, turns);
          expect(r.status, JSON.stringify(r.body)).toBe(200);
          const t = r.body.transcribed as { index: number; transcript: string };
          expect(t.index).toBe(turns.length - 1);
          turns[turns.length - 1] = { ...turns.at(-1)!, transcript: t.transcript };
        }
        expect(r.body).toMatchObject({ done: true, next_question: null });
        return turns.map((t) => ({ question: t.question, audio_path: t.audio_path! }));
      }

      // The state machine: Part 3 and Part 2 can't come first.
      expect((await turn(3, p3, [])).status).toBe(409);
      expect((await call(gold, { session_id: session, topic_id: topics.card, part: 2, audio_path: await upload("early") })).status).toBe(409);

      // Part 1: 5 questions (the set; the stub never stops early), then scored for 5 credits.
      const part1 = await converse(1, p1);
      expect(part1).toHaveLength(5);
      const s1 = await call(gold, { session_id: session, topic_id: p1, part: 1, answers: part1 });
      expect(s1.status, JSON.stringify(s1.body)).toBe(200);
      expect(s1.body).toMatchObject({ part: 1, credits_charged: 5 });
      expect(s1.body.transcript as string).toContain("Examiner: Where is your hometown?\nYou: ");

      // Part 2, then Part 3 with one follow-up (its answer asked for one), scored for 6.
      expect((await call(gold, { session_id: session, topic_id: topics.card, part: 2, audio_path: await upload("p2") })).status).toBe(200);
      const part3 = await converse(3, p3, 1);
      expect(part3.map((a) => a.question)).toContain("Why do you feel that way?");
      const s3 = await call(gold, { session_id: session, topic_id: p3, part: 3, answers: part3 });
      expect(s3.status, JSON.stringify(s3.body)).toBe(200);
      expect(s3.body).toMatchObject({ part: 3, credits_charged: 6 });

      // M8-B3: completed, with each part's band and the IELTS-rounded overall band.
      const { data: done } = await db.from("speaking_sessions").select("status, part1_band, part2_band, part3_band, overall_band").eq("id", session).single();
      expect(done).toMatchObject({ status: "completed", part1_band: 6, part2_band: 6, part3_band: 6, overall_band: 6 });
      // 5 + 4 + 6 = 15 credits; the examiner's turns cost nothing but are logged.
      expect(await balance(gold)).toBe(before - 15);
      const { data: usage } = await db.from("ai_usage").select("action_key, credits_charged").eq("user_id", gold.id).gte("created_at", new Date(stamp).toISOString());
      expect(usage!.filter((u) => u.credits_charged > 0).map((u) => u.credits_charged).sort()).toEqual([4, 5, 6]);
      expect(usage!.filter((u) => u.credits_charged === 0).length).toBeGreaterThanOrEqual(10); // one per examiner turn
      expect((await turn(1, p1, [])).status).toBe(409); // finished
    } finally {
      await db.from("speaking_sessions").delete().eq("user_id", gold.id).gte("started_at", new Date(stamp).toISOString());
      await db.from("speaking_topics").update({ status: "archived" }).in("id", [p3, p1]);
      await db.from("speaking_topics").delete().in("id", [p3, p1]);
    }
  });
});
