"use client";

import { useActionState, useState } from "react";
import { FileAudio } from "lucide-react";
import { type AdminListeningSection, TRANSCRIPT_MAX } from "@prepora/shared/api/admin-listening";
import { R2_AUDIO_MAX_BYTES, R2_AUDIO_TYPES, R2UploadResponse } from "@prepora/shared/api/r2-upload";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { saveListeningSection, saveListeningSectionAudio } from "@/lib/listening-actions";
import type { BuilderState } from "@/lib/reading-actions";
import { createClient } from "@/lib/supabase/client";
import { submitKeepingInput } from "../form-submit";

/**
 * One Listening section (M5-A1): title and transcript (what is said: students see it after
 * submitting), and the recording. The recording goes straight from the browser to R2 with a
 * presigned URL from r2-upload-url (M5-B1), with a progress bar; then its public URL and length
 * are saved on the section.
 */
export function SectionEditor({ testId, orderNo, section }: { testId: string; orderNo: number; section?: AdminListeningSection }) {
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = await saveListeningSection(prev, form);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `s${orderNo}-${name}`;

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-4" aria-label={`Section ${orderNo}`}>
        <input type="hidden" name="test_id" value={testId} />
        <input type="hidden" name="order_no" value={orderNo} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("title")} className="text-sm font-medium">
            Section {orderNo} title
          </label>
          <Input
            id={id("title")}
            name="title"
            required
            maxLength={200}
            defaultValue={section?.title}
            placeholder={["A phone call about a booking", "A talk about local facilities", "A tutorial discussion", "A lecture"][orderNo - 1]}
            aria-invalid={errors.title ? true : undefined}
            className="h-11"
          />
          {errors.title && <span className="text-xs text-destructive">{errors.title}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("transcript")} className="text-sm font-medium">
            Transcript
          </label>
          <Textarea
            id={id("transcript")}
            name="transcript"
            defaultValue={section?.transcript ?? ""}
            maxLength={TRANSCRIPT_MAX}
            rows={8}
            aria-invalid={errors.transcript ? true : undefined}
            className="max-h-[50vh] text-sm"
          />
          <span className={errors.transcript ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {errors.transcript ?? "Everything said in the recording. Students see it only after they submit the test."}
          </span>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : section ? `Save section ${orderNo}` : `Add section ${orderNo}`}
          </Button>
        </div>
      </form>

      {section && <AudioUpload testId={testId} orderNo={orderNo} section={section} />}
    </div>
  );
}

type Upload = { phase: "idle" } | { phase: "uploading"; percent: number } | { phase: "saving" } | { phase: "error"; message: string };

function AudioUpload({ testId, orderNo, section }: { testId: string; orderNo: number; section: AdminListeningSection }) {
  const [upload, setUpload] = useState<Upload>({ phase: "idle" });
  const busy = upload.phase === "uploading" || upload.phase === "saving";

  async function send(file: File) {
    const type = (R2_AUDIO_TYPES as readonly string[]).includes(file.type) ? file.type : null;
    if (!type) return setUpload({ phase: "error", message: "Use an MP3, M4A, WAV, OGG or WebM file." });
    if (file.size > R2_AUDIO_MAX_BYTES) return setUpload({ phase: "error", message: "Recordings can be 100 MB at most." });
    setUpload({ phase: "uploading", percent: 0 });

    // 1. A presigned URL for this section.
    const { data, error } = await createClient().functions.invoke("r2-upload-url", {
      body: { test_id: testId, section: orderNo, content_type: type, size_bytes: file.size },
    });
    if (error) {
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
      const message = (body as { error?: { message?: string } } | null)?.error?.message ?? "Couldn't start the upload.";
      return setUpload({ phase: "error", message: message.startsWith("Audio uploads aren't set up") ? `${message} (see docs/r2.md).` : message });
    }
    const target = R2UploadResponse.safeParse(data);
    if (!target.success) return setUpload({ phase: "error", message: "Couldn't start the upload." });

    // 2. Straight to R2, with progress.
    const ok = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", target.data.upload_url);
      for (const [k, v] of Object.entries(target.data.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && setUpload({ phase: "uploading", percent: Math.round((e.loaded / e.total) * 100) });
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!ok) return setUpload({ phase: "error", message: "The upload didn't go through. Check the connection and try again." });

    // 3. Its length, then save it on the section.
    setUpload({ phase: "saving" });
    const duration = await audioSeconds(file);
    const saved = await saveListeningSectionAudio({ test_id: testId, order_no: orderNo, audio_url: target.data.public_url, duration_sec: duration });
    if (!saved.ok) return setUpload({ phase: "error", message: saved.message });
    toast.success(saved.message);
    setUpload({ phase: "idle" });
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4" aria-label={`Section ${orderNo} recording`} data-testid={`audio-${orderNo}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium">Recording</h4>
        <label className={`inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm ${busy ? "opacity-50" : "cursor-pointer hover:bg-secondary/50"}`}>
          <FileAudio className="size-4" aria-hidden />
          {section.audio_url ? "Replace recording" : "Upload recording"}
          <input
            type="file"
            accept={R2_AUDIO_TYPES.join(",")}
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
              e.target.value = "";
            }}
            data-testid={`audio-file-${orderNo}`}
          />
        </label>
      </div>
      {section.audio_url ? (
        <div className="flex flex-col gap-1">
          <audio controls preload="metadata" src={section.audio_url} className="w-full" />
          <span className="text-xs text-muted-foreground">
            {section.duration_sec ? `${Math.floor(section.duration_sec / 60)}:${String(section.duration_sec % 60).padStart(2, "0")} · ` : ""}
            <span className="break-all">{section.audio_url}</span>
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No recording yet. MP3, M4A, WAV, OGG or WebM, up to 100 MB.</p>
      )}
      {upload.phase === "uploading" && (
        <div className="flex items-center gap-3" role="status" aria-live="polite">
          <progress max={100} value={upload.percent} className="h-2 flex-1 accent-primary" aria-label="Upload progress" />
          <span className="text-sm tabular-nums">{upload.percent}%</span>
        </div>
      )}
      {upload.phase === "saving" && <p className="text-sm text-muted-foreground" role="status">Saving…</p>}
      {upload.phase === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {upload.message}
        </p>
      )}
    </section>
  );
}

/** The recording's length in whole seconds, read by the browser (null if it can't tell). */
function audioSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) && audio.duration >= 1 ? Math.min(3600, Math.round(audio.duration)) : null);
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 10_000);
    audio.src = url;
  });
}
