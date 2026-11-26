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

export const ScoreSpeakingInput = z
  .object({
    session_id: z.uuid(),
    topic_id: z.uuid(),
    part: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    audio_path: SpeakingAudioPath,
    duration_sec: z.number().int().min(1).max(1800).optional(),
  })
  .strict();
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
