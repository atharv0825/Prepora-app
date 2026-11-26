// Photos of handwritten answers (M6-F2), in the browser: each photo is drawn onto a canvas and
// re-encoded as a JPEG at most 2000 px on its longer side before upload. That keeps both pages far
// under ocr-writing's 14 MB limit and turns iPhone HEIC photos (which Safari can decode) into a
// format every AI provider reads (DeepSeek doesn't take HEIC). Uploads go to the private
// writing-photos bucket, in the student's own folder ({user_id}/…), as its RLS requires (M6-C1).
import type { SupabaseClient } from "@supabase/supabase-js";

export const MAX_PAGES = 2;
const MAX_SIDE = 2000;
const QUALITY = 0.85;
/** Larger originals are refused before decoding (phones produce 2–8 MB). */
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export class PhotoError extends Error {
  constructor(
    readonly code: "too_large" | "unreadable" | "upload_failed",
    message: string,
  ) {
    super(message);
    this.name = "PhotoError";
  }
}

/** The size to draw at: the longer side capped at `maxSide`, aspect ratio kept. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A JPEG ready to upload, or PhotoError when the browser can't read the file. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError("too_large", "This photo is too large. Take it again at a lower resolution.");
  let bitmap: ImageBitmap;
  try {
    // Applies the photo's EXIF orientation, so pages taken sideways come out upright.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError(
      "unreadable",
      "This browser can't open that photo (HEIC photos only open in Safari). Take the photo with your phone, or save it as JPEG.",
    );
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("unreadable", "This browser can't prepare photos.");
  ctx.fillStyle = "#fff"; // transparent PNGs get a white page, not black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new PhotoError("unreadable", "This photo couldn't be prepared. Try another one.");
  return blob;
}

/** Uploads the pages in order; returns their writing-photos paths. */
export async function uploadPhotos(
  // Any schema: this only uses storage.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  pages: readonly Blob[],
): Promise<string[]> {
  const paths: string[] = [];
  for (const page of pages) {
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("writing-photos").upload(path, page, { contentType: "image/jpeg" });
    if (error) throw new PhotoError("upload_failed", `Your photo couldn't be uploaded: ${error.message}`);
    paths.push(path);
  }
  return paths;
}
