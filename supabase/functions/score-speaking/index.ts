// POST /functions/v1/score-speaking (M7-B3, M8-B2/B3). Contract: packages/shared/src/api/score-speaking.ts.
// Part 2: the cue card's one recording (speaking_p2, 4 credits). Parts 1 and 3: the examiner's
// questions with one recording per answer, from examiner-turn (speaking_p1 5, speaking_p3 6 credits;
// the turns themselves cost nothing).
//
//   1. Checks, before any credit is spent: the session is the caller's and AT this part (the state
//      machine, ielts/speaking-session.ts: a full test goes Part 1 → 2 → 3; 409 otherwise, 400 if
//      the session has no such part); the topic is published and for this part (in a full test, a
//      Part 3 must follow the student's Part 2 card); every recording is in the caller's folder,
//      exists, is ≤ 15 MB and is real audio by its first bytes (M7-B4). Then the plan and both keys.
//   2. withCredits(the part's action):
//      a. Gemini (stt.ts) transcribes EVERY recording here (in parallel), so the score never rests on a
//         transcript the browser could change. Too few words is refused (400) and refunded.
//      b. Signals: one recording's, or the answers' combined (combineSignals).
//      c. The AI scores with the part's versioned prompt (s1-v1, s2-v1, s3-v1). Pronunciation is
//         judged on intelligibility, never accent. Validated with ScoredSpeaking; better phrases
//         must quote the transcript; the band is recomputed from the four criteria.
//      d. The response is saved with only what the plan includes (Free: the summary).
//      e. M8-B3: the session gets the part's band; once the state machine says it's finished, it's
//         completed with its overall band: a single part's own band, or the IELTS-rounded mean of
//         Parts 1–3 (x.25 → x.5, x.75 → the next band).
//      Any failure refunds the credits. ai_usage gets one row: the AI's tokens, the audio's seconds,
//      and the cost of both (also on failure).
//   3. Returns the feedback with the credits charged and the new balance.

import { errors, HttpError } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import type { Json } from "../_shared/db.ts";
import { createHandler } from "../_shared/handler.ts";
import { AiCallError, type AiUsage, withCredits } from "../_shared/credits.ts";
import { aiConfigured, aiModel, generateJson } from "../_shared/ai.ts";
import { sniffAudioType, STT_MODEL, sttConfigured, transcribe } from "../_shared/stt.ts";
import { buildConversationRequest, buildPart2Request, SPEAKING_SETTINGS } from "../_shared/prompts/speaking.ts";
import { ScoredSpeaking, ScoreSpeakingInput } from "../_shared/speaking_schemas.ts";
import { isOwnPhotoPath as isOwnPath } from "../_shared/writing.ts";
import {
  combineSignals,
  conversationTranscript,
  type FillerCount,
  keepFoundPhrases,
  MIN_SCORABLE_WORDS,
  MIN_SCORABLE_WORDS_CONVERSATION,
  partsOf,
  type SessionMode,
  sessionOverallBand,
  sessionStage,
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
    model: ai?.model ?? STT_MODEL,
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

      // 1. The session must be AT this part (the state machine, M8-C1), the topic published.
      const { data: session, error: sError } = await db.from("speaking_sessions").select("id, user_id, mode, status").eq("id", input.session_id).maybeSingle();
      if (sError) throw new Error(`speaking_sessions: ${sError.code} ${sError.message}`);
      if (!session || session.user_id !== userId) throw errors.notFound("Session not found");
      const mode = session.mode as SessionMode;
      if (!partsOf(mode).includes(input.part)) {
        throw errors.validation([{ path: "part", message: `This session has no Part ${input.part}`, code: "custom" }]);
      }
      const { data: scored } = await db.from("speaking_responses").select("part, topic_id, band").eq("session_id", session.id);
      const stage = sessionStage(mode, (scored ?? []).map((r) => r.part));
      if (session.status !== "in_progress" || stage !== `part${input.part}`) {
        throw errors.conflict(
          stage === "finished" || session.status !== "in_progress"
            ? "This session is finished. Start a new one."
            : (scored ?? []).some((r) => r.part === input.part)
            ? `Part ${input.part} of this session is already scored`
            : `This session is at ${stage.replace("part", "Part ")}, not Part ${input.part}.`,
        );
      }

      const { data: topic, error: tError } = await db
        .from("speaking_topics")
        .select("id, part, title, cue_card_points, parent_topic_id, status")
        .eq("id", input.topic_id)
        .maybeSingle();
      if (tError) throw new Error(`speaking_topics: ${tError.code} ${tError.message}`);
      if (!topic || topic.status !== "published" || topic.part !== input.part) throw errors.notFound("Topic not found");
      let card: { title: string; points: string[] } | null = null;
      if (input.part === 3) {
        const part2 = (scored ?? []).find((r) => r.part === 2);
        if (mode === "full_test" && part2 && topic.parent_topic_id !== part2.topic_id) {
          throw errors.validation([{ path: "topic_id", message: "This discussion doesn't follow your Part 2 card", code: "custom" }]);
        }
        const { data: parent } = await db.from("speaking_topics").select("title, cue_card_points").eq("id", topic.parent_topic_id!).maybeSingle();
        card = parent ? { title: parent.title, points: parent.cue_card_points ?? [] } : null;
      }

      // The recordings: Part 2 has one; Parts 1 and 3 one per answer. All checked before spending.
      const clips = input.part === 2 ? [{ question: topic.title, audio_path: input.audio_path }] : input.answers;
      if (clips.some((c) => !isOwnPath(userId, c.audio_path))) {
        throw errors.validation([{ path: input.part === 2 ? "audio_path" : "answers", message: "Not one of your recordings", code: "custom" }]);
      }
      const audio = await Promise.all(
        clips.map(async (c) => {
          const { data: file, error: dError } = await db.storage.from("speaking-audio").download(c.audio_path);
          if (dError || !file) throw errors.notFound("Recording not found");
          if (file.size > AUDIO_MAX_BYTES) throw errors.validation([{ path: "audio_path", message: "A recording is too large (15 MB at most)", code: "too_big" }]);
          const bytes = new Uint8Array(await file.arrayBuffer());
          const type = sniffAudioType(bytes);
          if (!type) throw errors.validation([{ path: "audio_path", message: "That file isn't a recording we can read", code: "custom" }]);
          return { question: c.question, path: c.audio_path, bytes, type };
        }),
      );

      const model = aiModel("scoring");
      if (!sttConfigured()) throw new Error("GEMINI_API_KEY is not set: speech to text (docs/ai.md)");
      if (!aiConfigured(model)) throw new Error(`${model.provider} API key is not set (docs/ai.md)`);
      const detailed = await detailedFeedback(db, userId);
      const responseId = crypto.randomUUID();

      // 2. Spend, transcribe (every recording, here: never a transcript from the browser), measure,
      //    score, save; refund on any failure.
      const spent = await withCredits(
        { user, admin },
        ACTION[input.part],
        async () => {
          const heardAll = await Promise.allSettled(audio.map((a) => transcribe({ audio: new Blob([a.bytes], { type: a.type }), mimeType: a.type })));
          const ok = heardAll.flatMap((h) => (h.status === "fulfilled" ? [h.value] : []));
          const sttSec = ok.reduce((n, h) => n + h.usage.audio_seconds, 0);
          const sttCost = ok.reduce((n, h) => n + h.usage.cost_usd, 0);
          const failed = heardAll.find((h) => h.status === "rejected");
          if (failed) {
            const reason = (failed as PromiseRejectedResult).reason;
            throw new AiCallError(`transcription failed: ${reason instanceof Error ? reason.message : reason}`, combined(undefined, sttSec, sttCost), { cause: reason });
          }

          let transcript: string;
          let measured: { signals: SpeakingSignals; fillers: FillerCount[] };
          let duration: number;
          let request: { version: string; system: string; parts: Parameters<typeof generateJson>[0]["parts"] };
          if (input.part === 2) {
            const heard = ok[0]!;
            transcript = heard.text;
            duration = heard.duration_sec || input.duration_sec || 0;
            measured = speakingSignals({ transcript, durationSec: duration, silences: heard.silences });
            if (measured.signals.words < MIN_SCORABLE_WORDS) throw tooShort(measured.signals.words);
            request = buildPart2Request({ title: topic.title, points: topic.cue_card_points ?? [] }, transcript, measured.signals);
          } else {
            const turns = ok.map((h, i) => ({ question: audio[i]!.question, answer: h.text }));
            transcript = conversationTranscript(turns);
            measured = combineSignals(ok.map((h) => speakingSignals({ transcript: h.text, durationSec: h.duration_sec, silences: h.silences })));
            duration = measured.signals.duration_sec;
            if (measured.signals.words < MIN_SCORABLE_WORDS_CONVERSATION) throw tooShort(measured.signals.words);
            request = buildConversationRequest(input.part, { title: topic.title, card }, turns, measured.signals);
          }

          let out;
          try {
            out = await generateJson({ model, system: request.system, parts: request.parts, schema: ScoredSpeaking, ...SPEAKING_SETTINGS, deadlineMs: 100_000 });
          } catch (err) {
            if (err instanceof AiCallError) throw new AiCallError(err.message, combined(err.usage, sttSec, sttCost), { cause: err });
            throw err;
          }
          const usage = combined(out.usage, sttSec, sttCost);
          const scoredOut: Scored = { ...out.data, better_phrases: keepFoundPhrases(transcript, out.data.better_phrases) };
          const band = speakingPartBand(scoredOut.scores);
          const feedback = speakingFeedbackFor(scoredOut, detailed);

          const { error } = await db.from("speaking_responses").insert({
            id: responseId,
            session_id: session.id,
            user_id: userId,
            topic_id: topic.id,
            part: input.part,
            audio_paths: audio.map((a) => a.path),
            duration_sec: Math.round(duration),
            transcript,
            signals: measured.signals as unknown as Json,
            scores: scoredOut.scores as unknown as Json,
            band,
            feedback: feedback as unknown as Json,
            prompt_version: request.version,
          });
          if (error?.code === "23505") throw new AiCallError("this part was scored meanwhile", usage);
          if (error) throw new AiCallError(`speaking_responses insert: ${error.code} ${error.message}`, usage);

          // M8-B3: the session's part band, and once every part is scored, the overall band
          // (a single part's own band, or the IELTS-rounded mean of Parts 1–3).
          const bands: Partial<Record<1 | 2 | 3, number>> = { [input.part]: band };
          for (const r of scored ?? []) bands[r.part as 1 | 2 | 3] = Number(r.band);
          const finished = sessionStage(mode, [...(scored ?? []).map((r) => r.part), input.part]) === "finished";
          const { error: uError } = await db
            .from("speaking_sessions")
            .update({
              [`part${input.part}_band`]: band,
              ...(finished ? { status: "completed", completed_at: new Date().toISOString(), overall_band: sessionOverallBand(mode, bands) } : {}),
            })
            .eq("id", session.id);
          if (uError) console.error("[score-speaking] session update failed", uError.code); // the response is saved; the bands show from it
          return { result: { transcript, signals: measured.signals, fillers: measured.fillers, scores: scoredOut.scores, band, feedback }, usage };
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

function tooShort(words: number): HttpError {
  return new HttpError(400, "validation_failed", "We couldn't hear enough of an answer to score. Check your microphone and try again; your credits are refunded.", { words });
}
