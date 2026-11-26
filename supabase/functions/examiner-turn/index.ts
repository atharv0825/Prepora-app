// POST /functions/v1/examiner-turn (M8-B1). Contract: packages/shared/src/api/examiner-turn.ts.
//
// One examiner turn in Speaking Part 1 or Part 3:
//   1. The session is the caller's and AT this part (the state machine, M8-C1: 409 otherwise). The
//      topic is a published question set (Part 1) or discussion (Part 3); in a full test, a Part 3
//      must follow the student's own Part 2 card. Recordings are in the caller's folder.
//   2. The newest answer, if it came as a recording only, is transcribed (Groq Whisper) and returned.
//   3. The next question: the AI (deepseek-flash, no thinking: prompts/examiner.v1.ts) chooses the
//      next question from the set, a follow-up of its own on the last answer, or to stop. The
//      limits are enforced here, whatever it says: 4–5 questions (QUESTIONS_PER_PART), follow-ups
//      capped (MAX_FOLLOW_UPS: Part 1 1, Part 3 3), no repeats, no stopping before 4. If the AI
//      fails or isn't configured, the next set question is asked: a conversation never stalls.
// No credits: the turns are included in the part's price, charged once by score-speaking. The AI's
// tokens and Whisper's seconds are still logged in ai_usage (credits_charged 0) under the part's
// action key, so the real cost of a part is visible.

import { errors } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import { createHandler } from "../_shared/handler.ts";
import type { AiUsage } from "../_shared/credits.ts";
import { aiConfigured, aiModel, generateJson } from "../_shared/ai.ts";
import { sniffAudioType, sttConfigured, transcribe } from "../_shared/stt.ts";
import { buildExaminerRequest, EXAMINER_SETTINGS } from "../_shared/prompts/speaking.ts";
import { ExaminerChoice, ExaminerTurnInput } from "../_shared/speaking_schemas.ts";
import { isOwnPhotoPath as isOwnPath } from "../_shared/writing.ts";
import { examinerDone, MAX_FOLLOW_UPS, QUESTIONS_PER_PART, type SessionMode, sessionStage } from "../_shared/speaking.ts";

export type ExaminerTurnResponse = {
  transcribed: { index: number; transcript: string } | null;
  next_question: string | null;
  source: "set" | "follow_up" | null;
  question_no: number | null;
  done: boolean;
};

const ACTION = { 1: "speaking_p1", 3: "speaking_p3" } as const;

/** One ai_usage row for an uncharged call (best effort: never fails the turn). */
async function logUsage(db: DbClient, userId: string, actionKey: string, usage: AiUsage, success: boolean, latencyMs: number) {
  const n = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  const { error } = await db.from("ai_usage").insert({
    user_id: userId,
    action_key: actionKey,
    model: usage.model.slice(0, 80) || "unknown",
    input_tokens: Math.round(n(usage.input_tokens)),
    output_tokens: Math.round(n(usage.output_tokens)),
    audio_seconds: n(usage.audio_seconds),
    cost_usd: n(usage.cost_usd),
    credits_charged: 0,
    success,
    latency_ms: Math.round(latencyMs),
  });
  if (error) console.error("[examiner-turn] ai_usage insert failed", error.code);
}

Deno.serve(
  createHandler(
    { name: "examiner-turn", methods: ["POST"], auth: "required", input: ExaminerTurnInput, requirePinnedRegion: true },
    async ({ input, user, admin }): Promise<ExaminerTurnResponse> => {
      const db = admin();
      const userId = user!.id;
      const started = performance.now();

      // 1. Session (at this part), topic, recordings.
      const { data: session, error: sError } = await db.from("speaking_sessions").select("id, user_id, mode, status").eq("id", input.session_id).maybeSingle();
      if (sError) throw new Error(`speaking_sessions: ${sError.code} ${sError.message}`);
      if (!session || session.user_id !== userId) throw errors.notFound("Session not found");
      const { data: scored } = await db.from("speaking_responses").select("part, topic_id").eq("session_id", session.id);
      const stage = sessionStage(session.mode as SessionMode, (scored ?? []).map((r) => r.part));
      if (session.status !== "in_progress" || stage !== `part${input.part}`) {
        throw errors.conflict(stage === "finished" ? "This session is finished. Start a new one." : `This session is at ${stage.replace("part", "Part ")}, not Part ${input.part}.`);
      }
      const { data: topic, error: tError } = await db.from("speaking_topics").select("id, part, title, questions, parent_topic_id, status").eq("id", input.topic_id).maybeSingle();
      if (tError) throw new Error(`speaking_topics: ${tError.code} ${tError.message}`);
      if (!topic || topic.status !== "published" || topic.part !== input.part) throw errors.notFound("Topic not found");
      let card: { title: string; points: string[] } | null = null;
      if (input.part === 3) {
        const part2 = (scored ?? []).find((r) => r.part === 2);
        if (session.mode === "full_test" && part2 && topic.parent_topic_id !== part2.topic_id) {
          throw errors.validation([{ path: "topic_id", message: "This discussion doesn't follow your Part 2 card", code: "custom" }]);
        }
        const { data: parent } = await db.from("speaking_topics").select("title, cue_card_points").eq("id", topic.parent_topic_id!).maybeSingle();
        card = parent ? { title: parent.title, points: parent.cue_card_points ?? [] } : null;
      }
      const foreign = input.turns.filter((t) => t.audio_path && !isOwnPath(userId, t.audio_path));
      if (foreign.length) throw errors.validation([{ path: "turns", message: "Not one of your recordings", code: "custom" }]);

      // 2. Transcribe the newest answer if it came as a recording only.
      const usage: AiUsage = { model: "whisper-large-v3-turbo", input_tokens: 0, output_tokens: 0, audio_seconds: 0, cost_usd: 0 };
      let transcribed: ExaminerTurnResponse["transcribed"] = null;
      const turns = input.turns.map((t) => ({ question: t.question, answer: t.transcript ?? "" }));
      const newest = input.turns.at(-1);
      if (newest && newest.transcript === undefined && newest.audio_path) {
        const { data: file, error: dError } = await db.storage.from("speaking-audio").download(newest.audio_path);
        if (dError || !file) throw errors.notFound("Recording not found");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const type = sniffAudioType(bytes);
        if (!type) throw errors.validation([{ path: "turns", message: "That file isn't a recording we can read", code: "custom" }]);
        if (!sttConfigured()) throw new Error("GROQ_API_KEY is not set (docs/ai.md)");
        const heard = await transcribe({ audio: new Blob([bytes], { type }), mimeType: type });
        transcribed = { index: input.turns.length - 1, transcript: heard.text };
        turns[turns.length - 1]!.answer = heard.text;
        usage.audio_seconds = heard.usage.audio_seconds;
        usage.cost_usd = heard.usage.cost_usd;
      }

      // 3. The next question, within the limits.
      const set = topic.questions ?? [];
      const asked = turns.length;
      const askedText = new Set(turns.map((t) => t.question.trim()));
      const remaining = set.filter((q) => !askedText.has(q.trim()));
      const followUps = turns.filter((t) => !set.includes(t.question.trim())).length;
      const canFollowUp = asked > 0 && followUps < MAX_FOLLOW_UPS[input.part];
      const done = (r: Partial<ExaminerTurnResponse> = {}): ExaminerTurnResponse => ({ transcribed, next_question: null, source: null, question_no: null, done: true, ...r });
      const ask = (q: string, source: "set" | "follow_up"): ExaminerTurnResponse => ({ transcribed, next_question: q, source, question_no: asked + 1, done: false });

      let result: ExaminerTurnResponse;
      if (examinerDone(input.part, asked, false) || (!remaining.length && !canFollowUp && asked >= QUESTIONS_PER_PART[input.part].min)) {
        result = done();
      } else {
        const model = aiModel("lite");
        let choice: ExaminerChoice | null = null;
        if (aiConfigured(model)) {
          const req = buildExaminerRequest(input.part, { title: topic.title, card }, remaining, turns);
          try {
            const out = await generateJson({ model, system: req.system, parts: req.parts, schema: ExaminerChoice, ...EXAMINER_SETTINGS, timeoutMs: 20_000, deadlineMs: 30_000, maxAttempts: 2 });
            choice = out.data;
            Object.assign(usage, { model: out.usage.model, input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens, cost_usd: (usage.cost_usd ?? 0) + out.usage.cost_usd });
          } catch (err) {
            console.error("[examiner-turn] AI failed; asking the next set question", err instanceof Error ? err.message : err);
          }
        }
        if (choice?.action === "stop" && examinerDone(input.part, asked, true)) result = done();
        else if (choice?.action === "follow_up" && choice.follow_up && canFollowUp && !askedText.has(choice.follow_up.trim())) result = ask(choice.follow_up.trim(), "follow_up");
        else if (remaining.length) result = ask(remaining[Math.min(Math.max(choice?.set_index ?? 0, 0), remaining.length - 1)]!, "set");
        // The set is used up before the minimum: a neutral follow-up keeps the part going.
        else result = ask(input.part === 1 ? "Is there anything else you'd like to add about that?" : "Why do you think that is?", "follow_up");
      }

      if (usage.audio_seconds || usage.input_tokens) await logUsage(db, userId, ACTION[input.part], usage, true, performance.now() - started);
      return result;
    },
  ),
);
