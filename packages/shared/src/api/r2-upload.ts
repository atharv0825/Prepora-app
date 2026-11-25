// r2-upload-url contract (M5-B1): the Listening builder asks for a presigned URL, then PUTs the
// recording straight to Cloudflare R2 (with progress), then saves public_url as the section's
// audio_url. Staff only (admin, content editor).
//
//   POST /functions/v1/r2-upload-url  { test_id, section, content_type, size_bytes }
//   → 200 R2UploadResponse
//   → 400 validation_failed (type or size), 401, 403 (not staff), 404 (no such test),
//     503 internal "Audio uploads aren't set up yet" (R2 secrets missing)
//
// The upload must send exactly `headers` (Content-Type is signed) within expires_in seconds.
import { z } from "zod";

/** Same as AUDIO_TYPES in supabase/functions/_shared/r2.ts (checked by tests/r2.test.ts). */
export const R2_AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm"] as const;
export const R2_AUDIO_MAX_BYTES = 100 * 1024 * 1024;

export const R2UploadRequest = z
  .object({
    test_id: z.uuid(),
    /** Section (part) 1–4 of the Listening test. */
    section: z.number().int().min(1).max(4),
    content_type: z.enum(R2_AUDIO_TYPES),
    size_bytes: z.number().int().min(1).max(R2_AUDIO_MAX_BYTES),
  })
  .strict();
export type R2UploadRequest = z.infer<typeof R2UploadRequest>;

export const R2UploadResponse = z
  .object({
    upload_url: z.url(),
    method: z.literal("PUT"),
    headers: z.object({ "Content-Type": z.enum(R2_AUDIO_TYPES) }).strict(),
    /** Object key in the bucket: listening/<test>/section-<n>-<random>.<ext> */
    key: z.string(),
    /** Where students will stream it from (the bucket's public domain). */
    public_url: z.url(),
    expires_in: z.number().int().positive(),
  })
  .strict();
export type R2UploadResponse = z.infer<typeof R2UploadResponse>;
