// Cloudflare R2 presigned uploads (M5-B1). R2 speaks the S3 API, so an upload URL is an AWS
// Signature V4 presigned PUT (region "auto"), signed here with WebCrypto: no SDK, NO imports, so
// the same file runs in the Edge Function (Deno) and in the unit tests (vitest), which check it
// against AWS's published example.
//
// The URL is valid for a few minutes and only for one object key and one Content-Type (both
// signed). The browser PUTs the file straight to R2, with upload progress, and never sees the
// R2 keys; the audio is then served from the bucket's public domain (R2_PUBLIC_URL).

/** What the builder may upload. Same as R2_AUDIO_TYPES in packages/shared/src/api/r2-upload.ts. */
export const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};
/** 100 MB: about 90 minutes of 128 kbps MP3; a Listening section is 6–10 minutes. */
export const AUDIO_MAX_BYTES = 100 * 1024 * 1024;
export const UPLOAD_URL_SECONDS = 15 * 60;

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base URL of the bucket (custom domain or r2.dev), no trailing slash needed. */
  publicUrl: string;
}

/** R2 settings from the environment, or null when any is missing (uploads not set up). */
export function r2ConfigFrom(env: (name: string) => string | undefined): R2Config | null {
  const accountId = env("R2_ACCOUNT_ID");
  const accessKeyId = env("R2_ACCESS_KEY_ID");
  const secretAccessKey = env("R2_SECRET_ACCESS_KEY");
  const bucket = env("R2_BUCKET");
  const publicUrl = env("R2_PUBLIC_URL");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl: publicUrl.replace(/\/+$/, "") };
}

// ── SigV4 ───────────────────────────────────────────────────────────────────────────────────
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sha256(data: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** RFC 3986 encoding, as SigV4 wants it (everything but A–Z a–z 0–9 - _ . ~). */
export function uriEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export interface PresignInput {
  method: "GET" | "PUT";
  /** e.g. "<account>.r2.cloudflarestorage.com" */
  host: string;
  /** "/bucket/key", unencoded. */
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
  expiresIn: number;
  /** Extra headers the request must send exactly (signed), e.g. content-type. host is always signed. */
  headers?: Record<string, string>;
}

/** A presigned URL (query-string authentication, unsigned payload). */
export async function presignUrl(p: PresignInput): Promise<string> {
  const amzDate = p.date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const day = amzDate.slice(0, 8);
  const scope = `${day}/${p.region}/${p.service}/aws4_request`;

  const headers: Record<string, string> = { host: p.host };
  for (const [k, v] of Object.entries(p.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(";");

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${p.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(p.expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k]!)}`)
    .join("&");
  const canonicalPath = p.path.split("/").map(uriEncode).join("/");

  const canonicalRequest = [
    p.method,
    canonicalPath,
    canonicalQuery,
    names.map((n) => `${n}:${headers[n]}\n`).join(""),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");

  let key: ArrayBuffer = await hmac(enc.encode(`AWS4${p.secretAccessKey}`).slice().buffer, day);
  for (const part of [p.region, p.service, "aws4_request"]) key = await hmac(key, part);
  const signature = hex(await hmac(key, stringToSign));

  return `https://${p.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

/** Where a section's recording goes: listening/<test>/section-<n>-<random>.<ext>. */
export function audioKey(testId: string, section: number, contentType: string, random: string): string {
  return `listening/${testId}/section-${section}-${random}.${AUDIO_TYPES[contentType] ?? "bin"}`;
}

/** A presigned PUT for one recording, and the public URL it will have. */
export async function audioUpload(
  config: R2Config,
  key: string,
  contentType: string,
  now = new Date(),
): Promise<{ upload_url: string; public_url: string }> {
  const upload_url = await presignUrl({
    method: "PUT",
    host: `${config.accountId}.r2.cloudflarestorage.com`,
    path: `/${config.bucket}/${key}`,
    region: "auto",
    service: "s3",
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    date: now,
    expiresIn: UPLOAD_URL_SECONDS,
    headers: { "content-type": contentType },
  });
  return { upload_url, public_url: `${config.publicUrl}/${key.split("/").map(uriEncode).join("/")}` };
}
