// POST /functions/v1/ocr-writing (M6-B4). Contract: packages/shared/src/api/ocr-writing.ts.
//
//   1. The photos must be in the student's own writing-photos folder (400). Free plans get
//      403 feature_not_in_plan straight away (the plan's ocr flag; spend_credits checks it again).
//   2. Before any credit is spent: the optional task (404 if it isn't published), the photos
//      (404 if missing; 400 if a type the model can't read, e.g. HEIC on DeepSeek, or if together
//      they're too big to send inline) and the AI provider's key.
//   3. withCredits('ocr', 1 credit): the "lite" model (_shared/ai.ts: deepseek-flash by default)
//      transcribes each page exactly, mistakes
//      included, marking unsure words [?]; the reply must have one page per photo. A failure
//      refunds the credit.
//   4. Return the pages and the joined text for the editor. Nothing is saved: the student checks
//      the text and sends it to score-writing with input_mode "photo".

import { errors, HttpError } from "../_shared/errors.ts";
import type { DbClient } from "../_shared/auth.ts";
import { createHandler } from "../_shared/handler.ts";
import { withCredits } from "../_shared/credits.ts";
import { ADAPTERS, aiConfigured, aiModel, bytesToBase64, generateJson } from "../_shared/ai.ts";
import { buildOcrRequest, OCR_SETTINGS } from "../_shared/prompts/writing.ts";
import { OcrModelOutput, OcrWritingInput } from "../_shared/writing_schemas.ts";
import { countEssayWords, isOwnPhotoPath, joinOcrPages } from "../_shared/writing.ts";

/** Kept under Gemini's ~20 MB inline limit (DeepSeek allows 48 MiB); base64 adds a third. Phones should resize first (M6-F2). */
const PHOTOS_MAX_BYTES = 14 * 1024 * 1024;
const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};
const PHOTO_TYPES = new Set(Object.values(BY_EXTENSION));

export type OcrWritingResponse = {
  text: string;
  word_count: number;
  pages: { path: string; text: string; legibility: "good" | "partial" | "unreadable" }[];
  credits_charged: number;
  balance_after: number;
};

async function planHasOcr(db: DbClient, userId: string): Promise<boolean> {
  const { data: profile, error } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
  if (error) throw new Error(`profiles: ${error.code} ${error.message}`);
  const { data: plan, error: planError } = await db.from("plans").select("limits").eq("id", profile?.plan ?? "free").maybeSingle();
  if (planError) throw new Error(`plans: ${planError.code} ${planError.message}`);
  return (plan?.limits as { ocr?: boolean } | null)?.ocr === true;
}

async function download(db: DbClient, path: string): Promise<{ mimeType: string; bytes: Uint8Array }> {
  const { data, error } = await db.storage.from("writing-photos").download(path);
  if (error || !data) throw errors.notFound("Photo not found");
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = PHOTO_TYPES.has(data.type) ? data.type : BY_EXTENSION[ext];
  if (!mimeType) throw errors.validation([{ path: "photo_paths", message: "Not a photo (JPEG, PNG, WebP or HEIC)", code: "custom" }]);
  return { mimeType, bytes: new Uint8Array(await data.arrayBuffer()) };
}

Deno.serve(
  createHandler(
    { name: "ocr-writing", methods: ["POST"], auth: "required", input: OcrWritingInput, requirePinnedRegion: true },
    async ({ input, user, admin }): Promise<OcrWritingResponse> => {
      const db = admin();
      const userId = user!.id;

      // 1. Own folder; plan.
      const bad = input.photo_paths.filter((p) => !isOwnPhotoPath(userId, p));
      if (bad.length) {
        throw errors.validation(bad.map((p) => ({ path: "photo_paths", message: `Not one of your photos: ${p}`, code: "custom" })));
      }
      if (!(await planHasOcr(db, userId))) {
        throw new HttpError(403, "feature_not_in_plan", "Photo upload is part of Gold and Platinum", { action_key: "ocr", feature: "ocr" });
      }

      // 2. Task (optional context), photos, key: before spending.
      let taskPrompt: string | undefined;
      if (input.task_id) {
        const { data: task, error } = await db.from("writing_tasks").select("prompt, status").eq("id", input.task_id).maybeSingle();
        if (error) throw new Error(`writing_tasks: ${error.code} ${error.message}`);
        if (!task || task.status !== "published") throw errors.notFound("Task not found");
        taskPrompt = task.prompt;
      }
      const photos = await Promise.all(input.photo_paths.map((p) => download(db, p)));
      const total = photos.reduce((n, p) => n + p.bytes.byteLength, 0);
      if (total > PHOTOS_MAX_BYTES) {
        throw errors.validation([{ path: "photo_paths", message: "The photos are too large together (14 MB at most). Retake them at a lower resolution.", code: "too_big" }]);
      }
      const model = aiModel("lite");
      const unreadable = photos.filter((p) => !ADAPTERS[model.provider].imageTypes.has(p.mimeType));
      if (unreadable.length) {
        // M6-F2 converts photos to JPEG on the device, so this only catches old or direct uploads.
        throw errors.validation([{ path: "photo_paths", message: `Upload JPEG, PNG or WebP photos (not ${unreadable[0].mimeType})`, code: "custom" }]);
      }
      if (!aiConfigured(model)) throw new Error(`${model.provider} API key is not set (docs/ai.md)`);

      const request = buildOcrRequest(photos.map((p) => ({ mimeType: p.mimeType, data: bytesToBase64(p.bytes) })), taskPrompt);
      // One page per photo; a different count is retried like any invalid reply.
      const schema = OcrModelOutput.refine((o) => o.pages.length === photos.length, { message: `Expected ${photos.length} page(s)`, path: ["pages"] });

      // 3. Spend 1 credit, read, refund on failure.
      const spent = await withCredits({ user, admin }, "ocr", async () => {
        const out = await generateJson({
          model,
          system: request.system,
          parts: request.parts,
          schema,
          ...OCR_SETTINGS,
          deadlineMs: 90_000,
        });
        return { result: out.data, usage: out.usage };
      });

      // 4. Pages and the editor text.
      const pages = spent.result.pages.map((p, i) => ({ path: input.photo_paths[i], text: p.text, legibility: p.legibility }));
      const text = joinOcrPages(pages);
      return { text, word_count: countEssayWords(text), pages, credits_charged: spent.credits, balance_after: spent.balanceAfter };
    },
  ),
);
