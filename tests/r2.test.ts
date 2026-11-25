// M5-B1: the R2 presigner (supabase/functions/_shared/r2.ts, the module r2-upload-url runs),
// checked against AWS's published SigV4 example, and its limits against packages/shared.
import { describe, expect, it } from "vitest";
import { R2_AUDIO_MAX_BYTES, R2_AUDIO_TYPES, R2UploadRequest } from "../packages/shared/src/api/r2-upload";
import { AUDIO_MAX_BYTES, AUDIO_TYPES, audioKey, audioUpload, presignUrl, r2ConfigFrom, uriEncode } from "../supabase/functions/_shared/r2";

describe("SigV4 presigning (M5-B1)", () => {
  it("matches AWS's example presigned URL (S3 docs, query-string authentication)", async () => {
    const url = await presignUrl({
      method: "GET",
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      region: "us-east-1",
      service: "s3",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      date: new Date("2013-05-24T00:00:00Z"),
      expiresIn: 86400,
    });
    expect(url).toBe(
      "https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256" +
        "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request" +
        "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host" +
        "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("encodes like SigV4 wants", () => {
    expect(uriEncode("a b/c~d*e(f)")).toBe("a%20b%2Fc~d%2Ae%28f%29");
  });

  it("an R2 upload URL: account host, bucket path, region auto, Content-Type signed, 15 minutes", async () => {
    const config = r2ConfigFrom((n) => ({ R2_ACCOUNT_ID: "acc123", R2_ACCESS_KEY_ID: "AK", R2_SECRET_ACCESS_KEY: "SK", R2_BUCKET: "prepora-audio", R2_PUBLIC_URL: "https://audio.prepora.site/" })[n])!;
    const key = audioKey("5c100000-0000-0000-0000-000000000001", 2, "audio/mpeg", "r4nd");
    expect(key).toBe("listening/5c100000-0000-0000-0000-000000000001/section-2-r4nd.mp3");
    const { upload_url, public_url } = await audioUpload(config, key, "audio/mpeg", new Date("2026-11-25T10:00:00Z"));
    const u = new URL(upload_url);
    expect(u.host).toBe("acc123.r2.cloudflarestorage.com");
    expect(u.pathname).toBe(`/prepora-audio/${key}`);
    expect(u.searchParams.get("X-Amz-Credential")).toBe("AK/20261125/auto/s3/aws4_request");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(public_url).toBe(`https://audio.prepora.site/${key}`);
    // A different type is a different signature: the URL only accepts the type it was made for.
    const other = await audioUpload(config, key, "audio/wav", new Date("2026-11-25T10:00:00Z"));
    expect(new URL(other.upload_url).searchParams.get("X-Amz-Signature")).not.toBe(u.searchParams.get("X-Amz-Signature"));
  });

  it("not configured when any secret is missing", () => {
    expect(r2ConfigFrom(() => undefined)).toBeNull();
    expect(r2ConfigFrom((n) => (n === "R2_BUCKET" ? undefined : "x"))).toBeNull();
  });

  it("the Edge limits equal the shared contract", () => {
    expect(Object.keys(AUDIO_TYPES).sort()).toEqual([...R2_AUDIO_TYPES].sort());
    expect(AUDIO_MAX_BYTES).toBe(R2_AUDIO_MAX_BYTES);
    expect(R2UploadRequest.safeParse({ test_id: "5c100000-0000-4000-8000-000000000001", section: 5, content_type: "audio/mpeg", size_bytes: 1 }).success).toBe(false);
    expect(R2UploadRequest.safeParse({ test_id: "5c100000-0000-4000-8000-000000000001", section: 1, content_type: "video/mp4", size_bytes: 1 }).success).toBe(false);
  });
});
