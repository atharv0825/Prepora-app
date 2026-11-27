// generate-listening-audio contract: a Listening section's recording from its transcript
// (Google Cloud Text-to-Speech, Standard voices), and deleting a section's recording. Staff only.
//
//   POST /functions/v1/generate-listening-audio
//     { action: "generate", test_id, order_no, replace? }
//       → 200 { status: "cached", audio_url, chars: 0, estimated_chars }   same transcript + voices
//       → 202 { status: "started", job_id, chars, cost_usd }  poll listening_audio_jobs by id
//       → 400 bad_request (no title / transcript; a conversation without speaker labels)
//       → 409 conflict (audio exists and replace isn't true: details.reason "needs_confirmation";
//             a generation is already running)
//       → 422 validation_failed (the test's character budget: details { used, limit, chars })
//       → 503 internal (GOOGLE_TTS_API_KEY or storage not set up)
//     { action: "delete", test_id, order_no }
//       → 200 { status: "deleted" }; 409 conflict when the test is published
//
// The logic (speaker labels, voices, the estimate, the hash) is supabase/functions/_shared/listening_tts.ts,
// which the builder imports too, so its estimate and "up to date" status match the function.
import { z } from "zod";

export const GenerateAudioRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), test_id: z.uuid(), order_no: z.number().int().min(1).max(4), replace: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("delete"), test_id: z.uuid(), order_no: z.number().int().min(1).max(4) }).strict(),
]);
export type GenerateAudioRequest = z.infer<typeof GenerateAudioRequest>;

export const GenerateAudioResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("cached"), audio_url: z.string(), chars: z.literal(0), estimated_chars: z.number().int() }),
  z.object({ status: z.literal("started"), job_id: z.uuid(), chars: z.number().int(), cost_usd: z.number() }),
  z.object({ status: z.literal("deleted") }),
]);
export type GenerateAudioResponse = z.infer<typeof GenerateAudioResponse>;

/** A row of listening_audio_jobs (what the builder polls). */
export const AudioJob = z.object({
  id: z.uuid(),
  status: z.enum(["running", "succeeded", "failed"]),
  chars: z.number().int(),
  requests: z.number().int(),
  audio_url: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type AudioJob = z.infer<typeof AudioJob>;

export const audioSources = ["uploaded", "generated"] as const;
export type AudioSource = (typeof audioSources)[number];
