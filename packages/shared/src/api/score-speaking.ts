// score-speaking contract (M7-C2): POST /functions/v1/score-speaking, signed in. Implemented in M7-B3.
//
// The student records an answer (M7-F2), uploads it to the private speaking-audio bucket
// ({user_id}/{file}, M7-C1), then calls this with the session, the topic, the part and the path.
// The function spends the part's credits (withCredits 'speaking_p1' / 'speaking_p2' /
// 'speaking_p3'), transcribes the recording with word timings (M7-B1), measures the signals
// (speaking rate, pauses, fillers: M7-B2), asks the AI to score the transcript and signals against
// the rubric (M7-B3; DeepSeek takes no audio, so pronunciation is judged from the signals and the
// transcript's intelligibility), validates the JSON with ScoredSpeaking, recomputes the band from
// the four criteria, saves a speaking_responses row and returns the feedback.
//
// What each plan gets:
//   * Everyone: the transcript, the signals and the filler counts (measured, not AI feedback), the
//     four criteria, the band and a short summary.
//   * Gold/Platinum (plans.limits.detailed_feedback): also the better phrases, strengths,
//     improvements and a model answer. Free gets their count only, and the row stores the same
//     trimmed feedback (toSpeakingSummary), as for Writing.
//
// This version takes one recording (Part 2's single answer). Parts 1 and 3 (M8) answer several
// examiner questions; M8-C1 extends the request with one recording per answer.
//
// Errors (the shared { error: { code, message, details } } shape):
//   400 validation_failed      malformed body; a path outside the student's folder; a part the
//                              session doesn't have; a recording too short to score
//   401 unauthorized           no session
//   404 not_found              no such session (of this student), published topic or recording
//   409 conflict               this part of the session is already scored
//   402 insufficient_credits   / 429 daily_cap_reached (details: SpendResult refusal fields, M3-C3)
//   500 internal               transcription or the AI failed; credits refunded
import { z } from "zod";
import { isHalfBand } from "../ielts/writing";
import { speakingPartBand } from "../ielts/speaking";

const band = z.number().refine(isHalfBand, "A band is 0–9 in steps of 0.5");

/** Storage path in speaking-audio: {user_id}/{file}.{webm|ogg|m4a|mp4|aac|mp3|wav}. */
export const SpeakingAudioPath = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,100}\.(webm|ogg|m4a|mp4|aac|mp3|wav)$/,
    "Not a speaking-audio recording path",
  );

export const SpeakingPartSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const ScoreSpeakingRequest = z
  .object({
    session_id: z.uuid(),
    topic_id: z.uuid(),
    part: SpeakingPartSchema,
    audio_path: SpeakingAudioPath,
    /** Seconds recorded (the recorder's clock); the server measures the file too. */
    duration_sec: z.number().int().min(1).max(1800).optional(),
  })
  .strict();
export type ScoreSpeakingRequest = z.infer<typeof ScoreSpeakingRequest>;

export const SpeakingScoresSchema = z.object({ fc: band, lr: band, gra: band, pron: band }).strict();

/** Measured from the recording and its transcript (M7-B2). Pauses need word timings. */
export const SpeakingSignals = z
  .object({
    duration_sec: z.number().min(0),
    words: z.number().int().min(0),
    words_per_minute: z.number().int().min(0).nullable(),
    /** Silences of 1 s or more between words, and the longest one in seconds. */
    pauses: z.number().int().min(0).nullable(),
    longest_pause_sec: z.number().min(0).nullable(),
    filler_count: z.number().int().min(0),
  })
  .strict();
export type SpeakingSignals = z.infer<typeof SpeakingSignals>;

export const FillerCountSchema = z.object({ word: z.string().min(1), count: z.number().int().min(1) }).strict();

/**
 * A phrase the student said and a better way to say it. `original` is copied exactly from the
 * transcript, so the screen can highlight it (score-speaking drops ones it can't find).
 */
export const BetterPhrase = z
  .object({
    original: z.string().min(1).max(300),
    better: z.string().min(1).max(300),
    why: z.string().min(1).max(400),
  })
  .strict();
export type BetterPhrase = z.infer<typeof BetterPhrase>;

const paragraph = z.string().min(1).max(1500);
const point = z.string().min(1).max(400);

/** What the AI must return (validated in M7-B3). */
export const ScoredSpeaking = z
  .object({
    scores: SpeakingScoresSchema,
    summary: paragraph,
    better_phrases: z.array(BetterPhrase).max(15),
    strengths: z.array(point).min(1).max(6),
    improvements: z.array(point).min(1).max(6),
    /** A band-9 answer to the same topic, about as long as the part allows. */
    model_answer: z.string().min(1).max(5000),
  })
  .strict();
export type ScoredSpeaking = z.infer<typeof ScoredSpeaking>;

/** What speaking_responses.feedback holds (M7-C1): the full feedback, or the Free summary. */
export const SpeakingFeedback = z.discriminatedUnion("detail", [
  z
    .object({
      detail: z.literal("full"),
      summary: paragraph,
      better_phrases: z.array(BetterPhrase),
      strengths: z.array(point),
      improvements: z.array(point),
      model_answer: z.string().min(1),
    })
    .strict(),
  z
    .object({
      detail: z.literal("summary"),
      summary: paragraph,
      /** How many better phrases the full feedback has: the upgrade prompt says so. */
      better_phrases_count: z.number().int().min(0),
    })
    .strict(),
]);
export type SpeakingFeedback = z.infer<typeof SpeakingFeedback>;

const common = {
  response_id: z.uuid(),
  session_id: z.uuid(),
  topic_id: z.uuid(),
  part: SpeakingPartSchema,
  transcript: z.string().max(30_000),
  signals: SpeakingSignals,
  fillers: z.array(FillerCountSchema),
  scores: SpeakingScoresSchema,
  band,
  credits_charged: z.number().int().min(0),
  balance_after: z.number().int().min(0),
};

export const ScoreSpeakingResponse = z
  .discriminatedUnion("detail", [
    z
      .object({
        ...common,
        detail: z.literal("full"),
        summary: paragraph,
        better_phrases: z.array(BetterPhrase),
        strengths: z.array(point),
        improvements: z.array(point),
        model_answer: z.string().min(1),
      })
      .strict(),
    z
      .object({
        ...common,
        detail: z.literal("summary"),
        summary: paragraph,
        better_phrases_count: z.number().int().min(0),
      })
      .strict(),
  ])
  .refine((r) => r.band === speakingPartBand(r.scores), {
    message: "band must be the criteria's average rounded down to a half band",
    path: ["band"],
  })
  .refine((r) => r.signals.filler_count === r.fillers.reduce((n, f) => n + f.count, 0), {
    message: "filler_count must add up the fillers",
    path: ["signals", "filler_count"],
  });
export type ScoreSpeakingResponse = z.infer<typeof ScoreSpeakingResponse>;

/** The stored and returned feedback for a plan: full with detailed_feedback, else the summary. */
export function speakingFeedbackFor(scored: ScoredSpeaking, detailedFeedback: boolean): SpeakingFeedback {
  if (!detailedFeedback) return toSpeakingSummary(scored);
  const { scores: _scores, ...rest } = scored;
  return { detail: "full", ...rest };
}

export function toSpeakingSummary(
  scored: Pick<ScoredSpeaking, "summary" | "better_phrases">,
): Extract<SpeakingFeedback, { detail: "summary" }> {
  return { detail: "summary", summary: scored.summary, better_phrases_count: scored.better_phrases.length };
}
