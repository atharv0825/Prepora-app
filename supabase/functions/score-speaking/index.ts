// POST /functions/v1/score-speaking (M7-B3). Contract: packages/shared/src/api/score-speaking.ts.
// Part 2 (the cue card) now; Parts 1 and 3 arrive with the examiner in M8.
//
//   1. Checks, before any credit is spent (404/400/409): the session is the caller's and in
//      progress, its mode has this part, the part isn't scored yet; the topic is a published
//      Part 2 cue card; the recording is in the caller's folder, exists, is ≤ 15 MB and is a real
//      audio file (its container is read from its first bytes, M7-B4: WebM from Chrome/Android,
//      MP4/AAC from Safari/iOS). Then the student's plan and both keys (Groq, the AI).
//   2. withCredits('speaking_p2'):
//      a. Groq Whisper transcribes with word timings (stt.ts, M7-B1); an answer under
//         MIN_SCORABLE_WORDS words is refused (400) and refunded: nothing to score.
//      b. The signals: speaking rate, pauses, fillers, transcript confidence (speaking.ts, M7-B2).
//      c. The AI scores the transcript + signals with the versioned rubric (prompts/speaking.ts,
//         DeepSeek first). It hears no audio: Pronunciation is judged on intelligibility from the
//         transcript and its confidence, never on accent. The reply is validated with
//         ScoredSpeaking; better phrases that don't quote the transcript are dropped; the band is
//         recomputed from the four criteria.
//      d. The response is saved with only what the plan includes (Free: the summary), and the
//         session gets its part band (a single-part session is then complete, overall = that band).
//      Any failure refunds the credits. ai_usage gets one row: the AI's model and tokens, Whisper's
//      audio seconds, and the cost of both.
//   3. Returns the feedback with the credits charged and the new balance.

import { errors, HttpError } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import type { Json } from "../_shared/db.ts";
import { createHandler } from "../_shared/handler.ts";
import { AiCallError, type AiUsage, withCredits } from "../_shared/credits.ts";
import { aiConfigured, aiModel, generateJson } from "../_shared/ai.ts";
import { sniffAudioType, sttConfigured, transcribe } from "../_shared/stt.ts";
import { buildPart2Request, SPEAKING_SETTINGS } from "../_shared/prompts/speaking.ts";
import { ScoredSpeaking, ScoreSpeakingInput } from "../_shared/speaking_schemas.ts";
import { isOwnPhotoPath as isOwnPath } from "../_shared/writing.ts";
import {
  type FillerCount,
  keepFoundPhrases,
  MIN_SCORABLE_WORDS,
  type ScoredSpeaking as Scored,
  type SpeakingFeedback,
  speakingFeedbackFor,
  speakingPartBand,
  type SpeakingScores,
  type SpeakingSignals,
  speakingSignals,
} from "../_shared/speaking.ts";

const AUDIO_MAX_BYTES = 15 * 1024 * 1024;
const ACTION = { 1: "speaking_p1", 2: "speaking_p2", 3: "speaking_p3" } as const;

export type ScoreSpeakingResponse = {
  response_id: string;
  session_id: string;
  topic_id: string;
  part: 1 | 2 | 3;
  transcript: string;
  signals: SpeakingSignals;
  fillers: FillerCount[];
  scores: SpeakingScores;
  band: number;
  credits_charged: number;
  balance_after: number;
} & SpeakingFeedback;

async function detailedFeedback(db: DbClient, userId: string): Promise<boolean> {
  const { data: profile, error } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
  if (error) throw new Error(`profiles: ${error.code} ${error.message}`);
  const { data: plan, error: planError } = await db.from("plans").select("limits").eq("id", profile?.plan ?? "free").maybeSingle();
  if (planError) throw new Error(`plans: ${planError.code} ${planError.message}`);
  return (plan?.limits as { detailed_feedback?: boolean } | null)?.detailed_feedback === true;
}

/** Sum the transcription into the AI call's usage: one ai_usage row for the whole scoring. */
function combined(ai: AiUsage | undefined, sttSeconds: number, sttCost: number): AiUsage {
  return {
    model: ai?.model ?? "whisper-large-v3-turbo",
    input_tokens: ai?.input_tokens ?? 0,
    output_tokens: ai?.output_tokens ?? 0,
    audio_seconds: sttSeconds,
    cost_usd: (ai?.cost_usd ?? 0) + sttCost,
  };
}

Deno.serve(
  createHandler(
    { name: "score-speaking", methods: ["POST"], auth: "required", input: ScoreSpeakingInput, requirePinnedRegion: true },
    async ({ input, user, admin }): Promise<ScoreSpeakingResponse> => {
      const db = admin();
      const userId = user!.id;
      if (input.part !== 2) throw errors.validation([{ path: "part", message: "Parts 1 and 3 are scored with the examiner (coming soon)", code: "custom" }]);

      // 1. Session, topic, recording.
      const { data: session, error: sError } = await db.from("speaking_sessions").select("id, user_id, mode, status").eq("id", input.session_id).maybeSingle();
      if (sError) throw new Error(`speaking_sessions: ${sError.code} ${sError.message}`);
      if (!session || session.user_id !== userId) throw errors.notFound("Session not found");
      if (session.status !== "in_progress") throw errors.conflict("This session is finished. Start a new one.");
      if (session.mode !== "full_test" && session.mode !== `part${input.part}`) {
        throw errors.validation([{ path: "part", message: `This session has no Part ${input.part}`, code: "custom" }]);
      }
      const { data: done } = await db.from("speaking_responses").select("id").eq("session_id", session.id).eq("part", input.part).maybeSingle();
      if (done) throw errors.conflict(`Part ${input.part} of this session is already scored`);

      const { data: topic, error: tError } = await db
        .from("speaking_topics")
        .select("id, part, title, cue_card_points, status")
        .eq("id", input.topic_id)
        .maybeSingle();
      if (tError) throw new Error(`speaking_topics: ${tError.code} ${tError.message}`);
      if (!topic || topic.status !== "published" || topic.part !== input.part) throw errors.notFound("Topic not found");

      if (!isOwnPath(userId, input.audio_path)) {
        throw errors.validation([{ path: "audio_path", message: "Not one of your recordings", code: "custom" }]);
      }
      const { data: file, error: dError } = await db.storage.from("speaking-audio").download(input.audio_path);
      if (dError || !file) throw errors.notFound("Recording not found");
      if (file.size > AUDIO_MAX_BYTES) throw errors.validation([{ path: "audio_path", message: "The recording is too large (15 MB at most)", code: "too_big" }]);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const audioType = sniffAudioType(bytes);
      if (!audioType) throw errors.validation([{ path: "audio_path", message: "That file isn't a recording we can read", code: "custom" }]);

      const model = aiModel("scoring");
      if (!sttConfigured()) throw new Error("GROQ_API_KEY is not set (docs/ai.md)");
      if (!aiConfigured(model)) throw new Error(`${model.provider} API key is not set (docs/ai.md)`);
      const detailed = await detailedFeedback(db, userId);
      const responseId = crypto.randomUUID();

      // 2. Spend, transcribe, measure, score, save; refund on any failure.
      const spent = await withCredits(
        { user, admin },
        ACTION[input.part],
        async () => {
          const heard = await transcribe({ audio: new Blob([bytes], { type: audioType }), mimeType: audioType });
          const sttSec = heard.usage.audio_seconds;
          const sttCost = heard.usage.cost_usd;
          const transcript = heard.text;
          const duration = heard.duration_sec || input.duration_sec || 0;
          const { signals, fillers } = speakingSignals({ transcript, durationSec: duration, words: heard.words, segments: heard.segments });
          if (signals.words < MIN_SCORABLE_WORDS) {
            throw new HttpError(400, "validation_failed", "We couldn't hear enough of an answer to score. Check your microphone and try again; your credits are refunded.", {
              words: signals.words,
            });
          }

          const request = buildPart2Request({ title: topic.title, points: topic.cue_card_points ?? [] }, transcript, signals);
          let out;
          try {
            out = await generateJson({ model, system: request.system, parts: request.parts, schema: ScoredSpeaking, ...SPEAKING_SETTINGS, deadlineMs: 100_000 });
          } catch (err) {
            if (err instanceof AiCallError) throw new AiCallError(err.message, combined(err.usage, sttSec, sttCost), { cause: err });
            throw err;
          }
          const usage = combined(out.usage, sttSec, sttCost);
          const scored: Scored = { ...out.data, better_phrases: keepFoundPhrases(transcript, out.data.better_phrases) };
          const band = speakingPartBand(scored.scores);
          const feedback = speakingFeedbackFor(scored, detailed);

          const { error } = await db.from("speaking_responses").insert({
            id: responseId,
            session_id: session.id,
            user_id: userId,
            topic_id: topic.id,
            part: input.part,
            audio_paths: [input.audio_path],
            duration_sec: Math.round(duration),
            transcript,
            signals: signals as unknown as Json,
            scores: scored.scores as unknown as Json,
            band,
            feedback: feedback as unknown as Json,
            prompt_version: request.version,
          });
          if (error?.code === "23505") throw new AiCallError("this part was scored meanwhile", usage);
          if (error) throw new AiCallError(`speaking_responses insert: ${error.code} ${error.message}`, usage);

          // The session's part band; a single-part session is complete with it.
          const single = session.mode !== "full_test";
          const { error: uError } = await db
            .from("speaking_sessions")
            .update({
              [`part${input.part}_band`]: band,
              ...(single ? { status: "completed", completed_at: new Date().toISOString(), overall_band: band } : {}),
            })
            .eq("id", session.id);
          if (uError) console.error("[score-speaking] session update failed", uError.code); // the response is saved; the band shows from it
          return { result: { transcript, signals, fillers, scores: scored.scores, band, feedback }, usage };
        },
        { refId: responseId },
      );

      // 3. Results.
      const r = spent.result;
      return {
        response_id: responseId,
        session_id: session.id,
        topic_id: topic.id,
        part: input.part,
        transcript: r.transcript,
        signals: r.signals,
        fillers: r.fillers,
        scores: r.scores,
        band: r.band,
        credits_charged: spent.credits,
        balance_after: spent.balanceAfter,
        ...r.feedback,
      };
    },
  ),
);
