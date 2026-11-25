// POST /functions/v1/r2-upload-url (M5-B1). Contract: packages/shared/src/api/r2-upload.ts.
//
// Gives the Listening builder a short-lived presigned URL to PUT one section's recording
// straight into the R2 bucket (the browser shows upload progress; the R2 keys never leave this
// function), and the public URL the audio will have.
//
//   * Staff only (admin, content editor: both build tests). Others → 403.
//   * The test must exist (any status: the builder uploads to drafts) → else 404.
//   * Audio types and size are limited (400); the Content-Type is signed into the URL.
//   * R2 secrets missing → 503 "Audio uploads aren't set up yet" (see docs/r2.md).
//
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL.

import { z } from "../_shared/deps.ts";
import { errors, HttpError } from "../_shared/errors.ts";
import { createHandler } from "../_shared/handler.ts";
import { AUDIO_MAX_BYTES, AUDIO_TYPES, audioKey, audioUpload, r2ConfigFrom, UPLOAD_URL_SECONDS } from "../_shared/r2.ts";

// Same as R2UploadRequest in packages/shared/src/api/r2-upload.ts.
const Input = z
  .object({
    test_id: z.uuid(),
    section: z.number().int().min(1).max(4),
    content_type: z.enum(Object.keys(AUDIO_TYPES) as [string, ...string[]]),
    size_bytes: z.number().int().min(1).max(AUDIO_MAX_BYTES),
  })
  .strict();

export interface R2UploadResponse {
  upload_url: string;
  method: "PUT";
  headers: { "Content-Type": string };
  key: string;
  public_url: string;
  expires_in: number;
}

Deno.serve(
  createHandler(
    { name: "r2-upload-url", methods: ["POST"], auth: "required", input: Input },
    async ({ input, user, admin }): Promise<R2UploadResponse> => {
      const db = admin();
      const { data: profile } = await db.from("profiles").select("role").eq("id", user!.id).maybeSingle();
      if (profile?.role !== "admin" && profile?.role !== "content_editor") {
        throw errors.forbidden("Only admins and content editors can upload audio");
      }

      const { data: test, error } = await db.from("listening_tests").select("id").eq("id", input.test_id).maybeSingle();
      if (error) throw new Error(`listening_tests: ${error.code} ${error.message}`);
      if (!test) throw errors.notFound("Test not found");

      const config = r2ConfigFrom((name) => Deno.env.get(name));
      if (!config) throw new HttpError(503, "internal", "Audio uploads aren't set up yet");

      const key = audioKey(test.id, input.section, input.content_type, crypto.randomUUID());
      const { upload_url, public_url } = await audioUpload(config, key, input.content_type);
      return {
        upload_url,
        method: "PUT",
        headers: { "Content-Type": input.content_type },
        key,
        public_url,
        expires_in: UPLOAD_URL_SECONDS,
      };
    },
  ),
);
