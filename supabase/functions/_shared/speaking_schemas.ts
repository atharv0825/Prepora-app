// Zod schemas for score-speaking (M7-B3): copies of the contract in
// packages/shared/src/api/score-speaking.ts, which Edge Functions can't import.
// tests/speaking-signals.test.ts checks the field names and limits still match.
import { z } from "./deps.ts";

const band = z.number().refine((v) => Number.isFinite(v) && v >= 0 && v <= 9 && Number.isInteger(v * 2), "A band is 0–9 in steps of 0.5");

export const SpeakingAudioPath = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,100}\.(webm|ogg|m4a|mp4|aac|mp3|wav)$/,
    "Not a speaking-audio recording path",
  );

const SpeakingAnswer = z
  .object({
    question: z.string().trim().min(1).max(300),
    audio_path: SpeakingAudioPath,
    duration_sec: z.number().int().min(1).max(300).optional(),
  })
  .strict();

export const ScoreSpeakingInput = z.discriminatedUnion("part", [
  z
    .object({
      session_id: z.uuid(),
      topic_id: z.uuid(),
      part: z.literal(2),
      audio_path: SpeakingAudioPath,
      duration_sec: z.number().int().min(1).max(1800).optional(),
    })
    .strict(),
  z
    .object({
      session_id: z.uuid(),
      topic_id: z.uuid(),
      part: z.union([z.literal(1), z.literal(3)]),
      answers: z.array(SpeakingAnswer).min(4).max(5),
    })
    .strict(),
]);
export type ScoreSpeakingInput = z.infer<typeof ScoreSpeakingInput>;

const paragraph = z.string().min(1).max(1500);
const point = z.string().min(1).max(400);

/** What the AI must return (= ScoredSpeaking in the contract). */
export const ScoredSpeaking = z
  .object({
    scores: z.object({ fc: band, lr: band, gra: band, pron: band }).strict(),
    summary: paragraph,
    better_phrases: z
      .array(z.object({ original: z.string().min(1).max(300), better: z.string().min(1).max(300), why: z.string().min(1).max(400) }).strict())
      .max(15),
    strengths: z.array(point).min(1).max(6),
    improvements: z.array(point).min(1).max(6),
    model_answer: z.string().min(1).max(5000),
  })
  .strict();
export type ScoredSpeakingOutput = z.infer<typeof ScoredSpeaking>;

// ── examiner-turn (M8-B1) = ExaminerTurnRequest in packages/shared/src/api/examiner-turn.ts ─────
const ExaminerTurn = z
  .object({
    question: z.string().trim().min(1).max(300),
    audio_path: SpeakingAudioPath.optional(),
    transcript: z.string().max(5000).optional(),
    duration_sec: z.number().int().min(1).max(300).optional(),
  })
  .strict()
  .refine((t) => t.audio_path !== undefined || t.transcript !== undefined, { message: "An answer needs a recording or a transcript" });

export const ExaminerTurnInput = z
  .object({
    session_id: z.uuid(),
    part: z.union([z.literal(1), z.literal(3)]),
    topic_id: z.uuid(),
    turns: z.array(ExaminerTurn).max(5),
  })
  .strict()
  .superRefine((r, ctx) => {
    r.turns.slice(0, -1).forEach((t, i) => {
      if (t.transcript === undefined) ctx.addIssue({ code: "custom", path: ["turns", i, "transcript"], message: "Earlier answers need their transcript" });
    });
  });
export type ExaminerTurnInput = z.infer<typeof ExaminerTurnInput>;

/**
 * What the examiner AI returns: the next question from the set (by its index in the remaining
 * questions), a follow-up of its own, or stop. examiner-turn enforces the limits (QUESTIONS_PER_PART,
 * follow-up caps), whatever the AI says.
 */
export const ExaminerChoice = z
  .object({
    action: z.enum(["set", "follow_up", "stop"]),
    set_index: z.number().int().min(0).nullable(),
    follow_up: z.string().trim().min(5).max(200).nullable(),
  })
  .strict();
export type ExaminerChoice = z.infer<typeof ExaminerChoice>;
