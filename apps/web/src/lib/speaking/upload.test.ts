import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryableStatus, UploadError, uploadWithRetry } from "./upload";

/** A minimal XMLHttpRequest stand-in: each send() plays the next scripted outcome. */
let script: (number | "error")[] = [];
const sent: { url: string; headers: Record<string, string> }[] = [];
class FakeXhr {
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  status = 0;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private url = "";
  private headers: Record<string, string> = {};
  open(_m: string, url: string) {
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send() {
    sent.push({ url: this.url, headers: this.headers });
    const next = script.shift();
    queueMicrotask(() => {
      if (next === "error") return this.onerror?.();
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.status = next ?? 200;
      this.responseText = this.status >= 400 ? JSON.stringify({ message: `status ${this.status}` }) : "{}";
      this.onload?.();
    });
  }
}

beforeEach(() => {
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  script = [];
  sent.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const base = {
  url: "http://127.0.0.1:54321",
  publishableKey: "sb_publishable_x",
  accessToken: "jwt",
  bucket: "speaking-audio",
  path: "user-1/session 1.webm",
  blob: new Blob(["x"]),
  contentType: "audio/webm",
  sleep: () => Promise.resolve(),
};

describe("uploadWithRetry", () => {
  it("posts to Storage with the session, the bare type and upsert; reports progress", async () => {
    const progress: number[] = [];
    await uploadWithRetry({ ...base, onProgress: (f) => progress.push(f) });
    expect(sent[0]!.url).toBe("http://127.0.0.1:54321/storage/v1/object/speaking-audio/user-1/session%201.webm");
    expect(sent[0]!.headers).toMatchObject({ authorization: "Bearer jwt", apikey: "sb_publishable_x", "content-type": "audio/webm", "x-upsert": "true" });
    expect(progress).toEqual([0.5, 1]);
  });
  it("retries a dropped connection and a 503, then succeeds", async () => {
    script = ["error", 503, 200];
    await uploadWithRetry(base);
    expect(sent).toHaveLength(3);
  });
  it("doesn't retry a refused file (400, 413); gives up after 3 attempts", async () => {
    script = [413];
    await expect(uploadWithRetry(base)).rejects.toMatchObject({ status: 413, retryable: false });
    expect(sent).toHaveLength(1);
    sent.length = 0;
    script = [500, 500, 500];
    await expect(uploadWithRetry(base)).rejects.toBeInstanceOf(UploadError);
    expect(sent).toHaveLength(3);
  });
  it("retryable statuses", () => {
    expect([0, 408, 429, 500, 503].map(retryableStatus)).toEqual([true, true, true, true, true]);
    expect([400, 401, 403, 413].map(retryableStatus)).toEqual([false, false, false, false]);
  });
});
