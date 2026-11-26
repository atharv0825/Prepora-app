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
    const short = await call(gold, await prepare(gold, "stub-short.webm"));
    expect([short.status, short.body.error?.code]).toEqual([400, "validation_failed"]);
    expect(short.body.error?.message).toContain("couldn't hear enough");
    const failed = await call(gold, await prepare(gold, "stub-fail.webm"));
    expect([failed.status, failed.body.error?.code]).toEqual([500, "internal"]);
    expect(await balance(gold)).toBe(before);
    const { data: usage } = await db.from("ai_usage").select("success, audio_seconds").eq("user_id", gold.id).eq("success", false);
    expect(usage!.length).toBeGreaterThanOrEqual(2);
    expect(usage!.some((u) => Number(u.audio_seconds) > 0)).toBe(true); // the failed AI call still logs Whisper's seconds
  });
});
