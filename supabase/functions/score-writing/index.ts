// POST /functions/v1/score-writing (M6-B3). Contract: packages/shared/src/api/score-writing.ts.
//
//   1. The task must be published (404). Photo answers' paths must be in the student's own
//      writing-photos folder (400).
//   2. Before any credit is spent: the student's plan (detailed_feedback or the Free summary),
//      the Task 1 Academic chart (fetched and inlined for the model) and the Gemini key.
//   3. withCredits('writing_t1' | 'writing_t2'): Gemini scores the answer with the versioned
//      rubric prompt (_shared/prompts/writing.ts); the reply is validated with ScoredWriting;
//      corrections that don't quote the answer exactly are dropped; the band is recomputed from
//      the four criteria (never taken from the model); the submission is saved with ONLY what the
//      plan includes (Free: the summary). Any failure in there refunds the credits, and the
//      tokens are still logged in ai_usage.
//   4. Return the feedback with the credits charged and the new balance.
// The request's signal isn't passed to Gemini: if the student leaves, the scoring still finishes
// and is saved to their history instead of being thrown away.

import { errors } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import type { Json } from "../_shared/db.ts";
import { createHandler } from "../_shared/handler.ts";
import { AiCallError, withCredits } from "../_shared/credits.ts";
import { bytesToBase64, GEMINI_MODELS, generateJson } from "../_shared/gemini.ts";
import { buildScoringRequest, SCORING_SETTINGS } from "../_shared/prompts/writing.ts";
import { ScoredWriting, ScoreWritingInput } from "../_shared/writing_schemas.ts";
import {
  countEssayWords,
  isOwnPhotoPath,
  keepFoundCorrections,
  type ScoredWriting as Scored,
  WRITING_TASKS,
  type WritingFeedback,
  writingFeedbackFor,
  type WritingScores,
  type WritingTaskNo,
  writingTaskBand,
} from "../_shared/writing.ts";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type ScoreWritingResponse = {
  submission_id: string;
  task_id: string;
  task_no: WritingTaskNo;
  word_count: number;
  min_words: number;
  scores: WritingScores;
  band: number;
  credits_charged: number;
  balance_after: number;
} & WritingFeedback;

/** plans.limits.detailed_feedback for the student's plan (no profile = Free). */
async function detailedFeedback(db: DbClient, userId: string): Promise<boolean> {
  const { data: profile, error } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
  if (error) throw new Error(`profiles: ${error.code} ${error.message}`);
  const { data: plan, error: planError } = await db.from("plans").select("limits").eq("id", profile?.plan ?? "free").maybeSingle();
  if (planError) throw new Error(`plans: ${planError.code} ${planError.message}`);
  return (plan?.limits as { detailed_feedback?: boolean } | null)?.detailed_feedback === true;
}

/** The chart, inlined for the model. Fails before credits are spent. */
async function fetchImage(url: string): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`task image: HTTP ${res.status}`);
  const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!IMAGE_TYPES.has(mimeType)) throw new Error(`task image: unsupported type ${mimeType || "(none)"}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > IMAGE_MAX_BYTES) throw new Error("task image: over 5 MB");
  return { mimeType, data: bytesToBase64(bytes) };
}

Deno.serve(
  createHandler(
    { name: "score-writing", methods: ["POST"], auth: "required", input: ScoreWritingInput, requirePinnedRegion: true },
    async ({ input, user, admin }): Promise<ScoreWritingResponse> => {
      const db = admin();
      const userId = user!.id;

      // 1. The task, and the photos' folder.
      const { data: task, error: taskError } = await db
        .from("writing_tasks")
        .select("id, task_no, test_type, prompt, image_url, status")
        .eq("id", input.task_id)
        .maybeSingle();
      if (taskError) throw new Error(`writing_tasks: ${taskError.code} ${taskError.message}`);
      if (!task || task.status !== "published") throw errors.notFound("Task not found");
      const bad = (input.photo_paths ?? []).filter((p) => !isOwnPhotoPath(userId, p));
      if (bad.length) {
        throw errors.validation(bad.map((p) => ({ path: "photo_paths", message: `Not one of your photos: ${p}`, code: "custom" })));
      }

      // 2. Everything that can fail cheaply, before spending.
      if (!Deno.env.get("GEMINI_API_KEY")) throw new Error("GEMINI_API_KEY is not set (docs/gemini.md)");
      const taskNo = task.task_no as WritingTaskNo;
      const [detailed, image] = await Promise.all([
        detailedFeedback(db, userId),
        task.image_url ? fetchImage(task.image_url) : Promise.resolve(undefined),
      ]);
      const wordCount = countEssayWords(input.text);
      const submissionId = crypto.randomUUID();
      const request = buildScoringRequest(
        { taskNo, testType: task.test_type as "academic" | "general" | null, prompt: task.prompt, image },
        input.text,
      );

      // 3. Spend, score, save; refund on any failure.
      const spent = await withCredits(
        { user, admin },
        WRITING_TASKS[taskNo].actionKey,
        async () => {
          const out = await generateJson({
            model: GEMINI_MODELS.scoring,
            system: request.system,
            parts: request.parts,
            schema: ScoredWriting,
            ...SCORING_SETTINGS,
            deadlineMs: 110_000,
          });
          const scored: Scored = { ...out.data, corrections: keepFoundCorrections(input.text, out.data.corrections) };
          const band = writingTaskBand(scored.scores);
          const feedback = writingFeedbackFor(scored, detailed);

          const { error } = await db.from("writing_submissions").insert({
            id: submissionId,
            user_id: userId,
            task_id: task.id,
            input_mode: input.input_mode,
            photo_paths: input.photo_paths ?? null,
            text: input.text,
            word_count: wordCount,
            scores: scored.scores as unknown as Json,
            band,
            feedback: feedback as unknown as Json,
            time_taken_sec: input.time_taken_sec ?? null,
            prompt_version: request.version,
          });
          // Credits are refunded, and the tokens logged, by withCredits.
          if (error) throw new AiCallError(`writing_submissions insert: ${error.code} ${error.message}`, out.usage);
          return { result: { scores: scored.scores, band, feedback }, usage: out.usage };
        },
        { refId: submissionId },
      );

      // 4. Results.
      const { scores, band, feedback } = spent.result;
      return {
        submission_id: submissionId,
        task_id: task.id,
        task_no: taskNo,
        word_count: wordCount,
        min_words: WRITING_TASKS[taskNo].minWords,
        scores,
        band,
        credits_charged: spent.credits,
        balance_after: spent.balanceAfter,
        ...feedback,
      };
    },
  ),
);

