// Recording upload (M7-F3) with progress and retries. A 2-minute answer is 1–3 MB, below Supabase's
// 6 MB resumable (TUS) chunk, so a resumable protocol would gain nothing; what matters on a slow
// network is never losing the recording. So: XMLHttpRequest to Storage's REST endpoint (it reports
// upload progress, supabase-js's upload doesn't), automatic retries with backoff, upsert so a retry
// overwrites a half-written attempt, and the recording kept on the device (pending.ts) until it's
// scored, so the student can retry later, even after closing the tab.

export type UploadOptions = {
  url: string;
  publishableKey: string;
  accessToken: string;
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
  /** Total attempts (default 3). */
  attempts?: number;
  /** Test seam. */
  sleep?: (ms: number) => Promise<void>;
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Retry network errors, timeouts, rate limits and server errors; not a file the server refuses. */
export function retryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

function once(o: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${o.url}/storage/v1/object/${o.bucket}/${o.path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("authorization", `Bearer ${o.accessToken}`);
    xhr.setRequestHeader("apikey", o.publishableKey);
    xhr.setRequestHeader("content-type", o.contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) o.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        o.onProgress?.(1);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = body.message ?? body.error ?? message;
      } catch {
        /* not JSON */
      }
      reject(new UploadError(message, xhr.status, retryableStatus(xhr.status)));
    };
    xhr.onerror = () => reject(new UploadError("The connection dropped", 0, true));
    xhr.ontimeout = () => reject(new UploadError("The upload timed out", 0, true));
    xhr.send(o.blob);
  });
}

/** Uploads with retries (1 s, then 3 s apart). Throws the last UploadError. */
export async function uploadWithRetry(o: UploadOptions): Promise<void> {
  const attempts = Math.max(1, o.attempts ?? 3);
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let i = 1; ; i++) {
    try {
      await once(o);
      return;
    } catch (err) {
      const e = err instanceof UploadError ? err : new UploadError(String(err), 0, true);
      if (!e.retryable || i >= attempts) throw e;
      o.onProgress?.(0);
      await sleep(i === 1 ? 1000 : 3000);
    }
  }
}
