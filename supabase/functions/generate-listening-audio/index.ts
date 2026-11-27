// POST /functions/v1/generate-listening-audio: a Listening section's recording from its transcript.
// Contract: packages/shared/src/api/listening-audio.ts. Logic: _shared/listening_tts.ts.
//
//   { action: "generate", test_id, order_no, replace? }
//     → 200 { status: "cached", … }   the saved audio was made from exactly this transcript and
//                                      these voices (same SHA-256): no TTS call
//     → 202 { status: "started", job_id, chars, cost_usd }   runs in the background; the builder
//                                      polls listening_audio_jobs (staff can read it)
//     → 400 no transcript / a conversation without speaker labels
//     → 409 audio exists and replace isn't true / a generation is already running
//     → 422 the test's character budget would be exceeded
//   { action: "delete", test_id, order_no }
//     → 200 { status: "deleted" }   the file is removed from R2, then the section's audio cleared
//     → 409 the test is published (unpublish first) / a generation is running
//
//   * Staff only (admin, content editor). Others → 403.
//   * Google Cloud Text-to-Speech, Standard voices only, MP3, one request per speaker turn, then
//     ONE upload of the joined file (never a half-written file) to
//     listening/<test>/section-<n>-<hash>.mp3, then the old file is deleted.
//   * Every generation logs the characters sent and the cost (console, and the job row).
//
// Secrets: GOOGLE_TTS_API_KEY (Cloud Text-to-Speech enabled for its project), the R2 settings of
// r2-upload-url. Optional: LISTENING_TTS_SSML=0 (no pauses between turns),
// LISTENING_TTS_TEST_CHAR_LIMIT (default 100,000 per test), GOOGLE_TTS_API_URL (CI: the ai-stub),
// LISTENING_AUDIO_STORE=supabase-storage (local/CI: a Storage bucket instead of R2) with
// LISTENING_AUDIO_DEV_PUBLIC_URL (the gateway URL browsers and tests reach).

import { z } from "../_shared/deps.ts";
import type { DbClient } from "../_shared/auth.ts";
import { errors, HttpError } from "../_shared/errors.ts";
import { createHandler, json } from "../_shared/handler.ts";
import {
  audioHash,
  cachedAudio,
  estimateCostUsd,
  objectKeyFromUrl,
  planSectionAudio,
  runGeneration,
  type Segment,
  TTS_CHAR_LIMIT_PER_TEST,
  TTS_SAMPLE_RATE,
  TTS_SSML_DEFAULT,
  withinLimit,
} from "../_shared/listening_tts.ts";
import { objectRequestUrl, publicObjectUrl, r2ConfigFrom } from "../_shared/r2.ts";

// Same as GenerateAudioRequest in packages/shared/src/api/listening-audio.ts.
const Section = { test_id: z.uuid(), order_no: z.number().int().min(1).max(4) };
const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), ...Section, replace: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("delete"), ...Section }).strict(),
]);

const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";
const DEV_BUCKET = "listening-audio-dev";
/** A "running" job older than this is treated as failed (the background task was stopped). */
const STALE_MINUTES = 10;

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const env = (name: string) => Deno.env.get(name);
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ fn: "generate-listening-audio", ...event }));

// ── Storage: R2, or (local/CI only) a Supabase Storage bucket ───────────────────────────────
type Store = { put(key: string, bytes: Uint8Array): Promise<string>; del(key: string): Promise<void>; base: string };

function storeFrom(admin: () => DbClient): Store | null {
  if (env("LISTENING_AUDIO_STORE") === "supabase-storage") {
    const base = `${(env("LISTENING_AUDIO_DEV_PUBLIC_URL") || env("SUPABASE_URL") || "").replace(/\/+$/, "")}/storage/v1/object/public/${DEV_BUCKET}`;
    const bucket = () => admin().storage.from(DEV_BUCKET);
    return {
      base,
      async put(key, bytes) {
        await admin().storage.createBucket(DEV_BUCKET, { public: true }).catch(() => undefined); // exists: fine
        const { error } = await bucket().upload(key, bytes, { contentType: "audio/mpeg", upsert: true });
        if (error) throw new Error(`storage upload: ${error.message}`);
        return `${base}/${key}`;
      },
      async del(key) {
        const { error } = await bucket().remove([key]);
        if (error) throw new Error(`storage delete: ${error.message}`);
      },
    };
  }
  const config = r2ConfigFrom(env);
  if (!config) return null;
  // The signed URL (access key id, signature) never goes into an error message, log or job row.
  const send = async (url: string, init: RequestInit, what: string) => {
    try {
      return await fetch(url, init);
    } catch {
      throw new Error(`${what} failed: storage couldn't be reached.`);
    }
  };
  return {
    base: config.publicUrl,
    async put(key, bytes) {
      const res = await send(await objectRequestUrl(config, "PUT", key, "audio/mpeg"), { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: bytes.slice() }, "R2 upload");
      if (!res.ok) throw new Error(`R2 upload failed (${res.status})`);
      return publicObjectUrl(config, key);
    },
    async del(key) {
      const res = await send(await objectRequestUrl(config, "DELETE", key), { method: "DELETE" }, "R2 delete");
      if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
    },
  };
}

// ── Text-to-speech ──────────────────────────────────────────────────────────────────────────
const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** One Google Cloud TTS request (Standard voice, MP3), retried twice on 429 / 5xx / network errors. */
async function synthesize(segment: Segment, apiKey: string): Promise<Uint8Array> {
  const body = JSON.stringify({
    input: segment.ssml ? { ssml: segment.input } : { text: segment.input },
    voice: { languageCode: segment.languageCode, name: segment.voice },
    audioConfig: { audioEncoding: "MP3", sampleRateHertz: TTS_SAMPLE_RATE },
  });
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(env("GOOGLE_TTS_API_URL") || TTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body,
      });
    } catch (e) {
      if (attempt >= 2) throw new Error(`The speech service couldn't be reached (${e instanceof Error ? e.message : e}).`);
    }
    if (res?.ok) {
      const data = (await res.json()) as { audioContent?: string };
      if (!data.audioContent) throw new Error("The speech service returned no audio.");
      return decode(data.audioContent);
    }
    if (res && !(res.status === 429 || res.status >= 500)) {
      const detail = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "";
      if (res.status === 401 || res.status === 403) throw new Error("The speech service refused the key: check GOOGLE_TTS_API_KEY and that Cloud Text-to-Speech is enabled.");
      throw new Error(`The speech service refused the request (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}.`);
    }
    if (attempt >= 2) throw new Error(`The speech service failed (${res?.status ?? "network"}). Try again in a minute.`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

// ── The handler ─────────────────────────────────────────────────────────────────────────────
Deno.serve(
  createHandler({ name: "generate-listening-audio", methods: ["POST"], auth: "required", input: Input, requirePinnedRegion: true }, async ({ req, input, user, admin }) => {
    const db = admin();
    const { data: profile } = await db.from("profiles").select("role").eq("id", user!.id).maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "content_editor") {
      throw errors.forbidden("Only admins and content editors can generate or delete audio");
    }

    const { data: test, error: testError } = await db.from("listening_tests").select("id, status").eq("id", input.test_id).maybeSingle();
    if (testError) throw new Error(`listening_tests: ${testError.code} ${testError.message}`);
    if (!test) throw errors.notFound("Test not found");
    const { data: section, error: sectionError } = await db
      .from("listening_sections")
      .select("id, order_no, title, transcript, audio_url, audio_source, audio_hash, tts_voices")
      .eq("test_id", test.id)
      .eq("order_no", input.order_no)
      .maybeSingle();
    if (sectionError) throw new Error(`listening_sections: ${sectionError.code} ${sectionError.message}`);
    if (!section) throw errors.badRequest(`Save section ${input.order_no} first.`);

    // A generation stopped mid-way (function limits, a deploy) stays "running": time it out.
    await db
      .from("listening_audio_jobs")
      .update({ status: "failed", error: "Stopped before it finished. Try again.", finished_at: new Date().toISOString() })
      .eq("section_id", section.id)
      .eq("status", "running")
      .lt("created_at", new Date(Date.now() - STALE_MINUTES * 60_000).toISOString());
    const { count: running } = await db.from("listening_audio_jobs").select("id", { count: "exact", head: true }).eq("section_id", section.id).eq("status", "running");

    const store = storeFrom(admin);
    // The S3 API endpoint needs signed requests: browsers can't play from it.
    if (store && /\.r2\.cloudflarestorage\.com/i.test(store.base)) {
      throw new HttpError(
        503,
        "internal",
        "R2_PUBLIC_URL is the bucket's private API endpoint. Set it to the bucket's public address (its r2.dev URL or custom domain).",
      );
    }

    // ── Delete ──
    if (input.action === "delete") {
      if (test.status === "published") {
        throw new HttpError(409, "conflict", "This test is published. Move it back to draft before deleting its audio.");
      }
      if (running) throw new HttpError(409, "conflict", "Audio for this section is being generated. Wait for it to finish.");
      if (!section.audio_url) return { status: "deleted" };
      const key = store ? objectKeyFromUrl(section.audio_url, store.base, test.id) : null;
      if (key) await store!.del(key);
      else if (!store && section.audio_source === "generated") throw new HttpError(503, "internal", "Audio storage isn't set up yet");
      const { error } = await db.from("listening_sections").update({ audio_url: null, duration_sec: null }).eq("id", section.id);
      if (error) throw new Error(`clear section audio: ${error.code} ${error.message}`);
      log({ event: "audio_deleted", test_id: test.id, section: section.order_no, source: section.audio_source, key });
      return { status: "deleted" };
    }

    // ── Generate ──
    if (!section.title?.trim()) throw errors.badRequest(`Give section ${section.order_no} a title first.`);
    const ssml = env("LISTENING_TTS_SSML") ? env("LISTENING_TTS_SSML") !== "0" : TTS_SSML_DEFAULT;
    const planned = planSectionAudio({ transcript: section.transcript ?? "", section: section.order_no, voices: section.tts_voices as Record<string, unknown>, ssml });
    if (!planned.ok) throw errors.badRequest(planned.error);
    const plan = planned.plan;
    const hash = await audioHash(plan);

    // Reuse the saved audio only if it's at the current public address (a changed R2_PUBLIC_URL
    // regenerates, instead of handing back a URL that doesn't play).
    if (cachedAudio(section, hash) && !!store && section.audio_url!.startsWith(`${store.base}/`)) {
      log({ event: "tts_cached", test_id: test.id, section: section.order_no, chars: 0, chars_saved: plan.chars });
      return { status: "cached", audio_url: section.audio_url, chars: 0, estimated_chars: plan.chars };
    }
    if (section.audio_url && !input.replace) {
      throw new HttpError(409, "conflict", "This section already has audio. Confirm to replace it.", { reason: "needs_confirmation" });
    }
    if (running) throw new HttpError(409, "conflict", "Audio for this section is already being generated.");

    const limit = Number(env("LISTENING_TTS_TEST_CHAR_LIMIT")) || TTS_CHAR_LIMIT_PER_TEST;
    const { data: jobs, error: jobsError } = await db.from("listening_audio_jobs").select("chars").eq("test_id", test.id);
    if (jobsError) throw new Error(`listening_audio_jobs: ${jobsError.code} ${jobsError.message}`);
    const used = (jobs ?? []).reduce((n, j) => n + j.chars, 0);
    if (!withinLimit(used, plan.chars, limit)) {
      throw new HttpError(
        422,
        "validation_failed",
        `This would send ${plan.chars.toLocaleString("en")} characters; this test has used ${used.toLocaleString("en")} of its ${limit.toLocaleString("en")}-character limit.`,
        { used, limit, chars: plan.chars },
      );
    }

    const apiKey = env("GOOGLE_TTS_API_KEY");
    if (!apiKey) throw new HttpError(503, "internal", "Audio generation isn't set up yet (GOOGLE_TTS_API_KEY)");
    if (!store) throw new HttpError(503, "internal", "Audio storage isn't set up yet");

    const { data: job, error: jobError } = await db
      .from("listening_audio_jobs")
      .insert({ test_id: test.id, section_id: section.id, order_no: section.order_no, chars: plan.chars, requests: plan.segments.length, audio_hash: hash, created_by: user!.id })
      .select("id")
      .single();
    if (jobError?.code === "23505") throw new HttpError(409, "conflict", "Audio for this section is already being generated.");
    if (jobError) throw new Error(`create job: ${jobError.code} ${jobError.message}`);

    const previousKey = objectKeyFromUrl(section.audio_url, store.base, test.id);
    const work = runGeneration(plan, { testId: test.id, section: section.order_no, hash, previousKey }, {
      synthesize: (s) => synthesize(s, apiKey),
      putObject: (key, bytes) => store.put(key, bytes),
      deleteObject: (key) => store.del(key),
      async saveSection(audio) {
        const { error } = await db
          .from("listening_sections")
          .update({ ...audio, audio_source: "generated", audio_generated_at: new Date().toISOString() })
          .eq("id", section.id);
        if (error) throw new Error(`save section audio: ${error.code} ${error.message}`);
      },
      log,
    })
      .then((out) =>
        db.from("listening_audio_jobs").update({ status: "succeeded", audio_url: out.audio_url, finished_at: new Date().toISOString() }).eq("id", job.id),
      )
      .catch(async (e) => {
        const message = e instanceof Error ? e.message : String(e);
        log({ event: "tts_failed", test_id: test.id, section: section.order_no, chars: plan.chars, error: message });
        await db.from("listening_audio_jobs").update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", job.id);
      });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;

    log({ event: "tts_started", test_id: test.id, section: section.order_no, job_id: job.id, chars: plan.chars, requests: plan.segments.length, cost_usd: Number(estimateCostUsd(plan.chars).toFixed(4)) });
    return json(req, 202, { status: "started", job_id: job.id, chars: plan.chars, cost_usd: estimateCostUsd(plan.chars) });
  }),
);
