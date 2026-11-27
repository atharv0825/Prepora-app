"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FunctionRegion } from "@supabase/supabase-js";
import { AudioLines, FileAudio, Trash2, Wand2 } from "lucide-react";
import { type AdminListeningSection, TRANSCRIPT_MAX } from "@prepora/shared/api/admin-listening";
import { ContentStatus } from "@prepora/shared/api/admin-reading";
import { AudioJob, GenerateAudioResponse } from "@prepora/shared/api/listening-audio";
import { R2_AUDIO_MAX_BYTES, R2_AUDIO_TYPES, R2UploadResponse } from "@prepora/shared/api/r2-upload";
import { PINNED_FUNCTION_REGION } from "@prepora/shared/api/regions";
import { Badge } from "@prepora/ui/components/badge";
import { Button } from "@prepora/ui/components/button";
import { Input } from "@prepora/ui/components/input";
import { toast } from "@prepora/ui/components/sonner";
import { Textarea } from "@prepora/ui/components/textarea";
import { saveListeningSection, saveListeningSectionAudio } from "@/lib/listening-actions";
import type { BuilderState } from "@/lib/reading-actions";
import { createClient } from "@/lib/supabase/client";
import {
  audioHash,
  CONVERSATION_SECTIONS,
  effectiveVoices,
  estimateCostUsd,
  parseSpeakerTurns,
  planSectionAudio,
  TTS_CHAR_LIMIT_PER_TEST,
  TTS_VOICES,
  voiceByName,
} from "../../../../../supabase/functions/_shared/listening_tts";
import { submitKeepingInput } from "../form-submit";
import { selectClass } from "../reading/status";

/**
 * One Listening section (M5-A1): title and transcript (what is said: students see it after
 * submitting), the voice per speaker, and the recording. The recording is either generated from
 * the saved transcript (generate-listening-audio: Google text-to-speech, Standard voices) or
 * uploaded: straight from the browser to R2 with a presigned URL from r2-upload-url (M5-B1), with
 * a progress bar; then its public URL and length are saved on the section.
 */
export function SectionEditor({
  testId,
  testStatus,
  orderNo,
  section,
  ttsCharsUsed = 0,
}: {
  testId: string;
  testStatus: ContentStatus;
  orderNo: number;
  section?: AdminListeningSection;
  ttsCharsUsed?: number;
}) {
  const [state, action, pending] = useActionState(async (prev: BuilderState, form: FormData) => {
    const result = await saveListeningSection(prev, form);
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    return result;
  }, { ok: true, message: "" });
  const errors = state.fieldErrors ?? {};
  const id = (name: string) => `s${orderNo}-${name}`;
  const conversation = CONVERSATION_SECTIONS.includes(orderNo);

  const [title, setTitle] = useState(section?.title ?? "");
  const [transcript, setTranscript] = useState(section?.transcript ?? "");
  const [voices, setVoices] = useState<Record<string, string>>(section?.tts_voices ?? {});
  const speakers = useMemo(() => parseSpeakerTurns(transcript).speakers, [transcript]);
  const defaults = useMemo(() => effectiveVoices(speakers, {}, orderNo), [speakers, orderNo]);
  // Only the current speakers' choices are saved.
  const chosen = Object.fromEntries(speakers.filter((s) => voices[s.key]).map((s) => [s.key, voices[s.key]!]));
  const saved = section && { title: section.title, transcript: section.transcript ?? "", voices: section.tts_voices };
  const dirty = !saved || title.trim() !== saved.title || transcript.trim() !== saved.transcript.trim() || JSON.stringify(chosen) !== JSON.stringify(Object.fromEntries(Object.entries(saved.voices).filter(([k]) => speakers.some((s) => s.key === k))));

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submitKeepingInput(action)} className="flex flex-col gap-4" aria-label={`Section ${orderNo}`}>
        <input type="hidden" name="test_id" value={testId} />
        <input type="hidden" name="order_no" value={orderNo} />
        <input type="hidden" name="tts_voices" value={JSON.stringify(chosen)} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id("title")} className="text-sm font-medium">
            Section {orderNo} title
          </label>
          <Input
            id={id("title")}
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            maxLength={TRANSCRIPT_MAX}
            rows={8}
            placeholder={conversation ? "Man: Good morning, Riverside Hotel.\nWoman: Hi, I'd like to book a room…" : "Welcome to the museum. Today I'll explain…"}
            aria-invalid={errors.transcript ? true : undefined}
            className="max-h-[50vh] text-sm"
          />
          <span className={errors.transcript ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {errors.transcript ??
              `Everything said in the recording. Students see it only after they submit the test. ${
                conversation ? 'A conversation: start each turn with the speaker, e.g. "Man:", "Woman:", "Speaker 1:".' : "A monologue: no speaker labels needed."
              }`}
          </span>
        </div>

        {speakers.length > 0 && (
          <fieldset className="flex flex-col gap-2" data-testid={`voices-${orderNo}`}>
            <legend className="mb-1 text-sm font-medium">Voices for generated audio</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {speakers.map((s) => (
                <label key={s.key} className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">{s.label}</span>
                  <select
                    className={selectClass}
                    value={voices[s.key] ?? ""}
                    onChange={(e) => setVoices((v) => ({ ...v, [s.key]: e.target.value }))}
                    aria-label={`Voice for ${s.label}`}
                  >
                    <option value="">Default ({voiceByName(defaults[s.key]!)?.label ?? defaults[s.key]})</option>
                    {TTS_VOICES.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : section ? `Save section ${orderNo}` : `Add section ${orderNo}`}
          </Button>
        </div>
      </form>

      {section && <Recording testId={testId} testStatus={testStatus} orderNo={orderNo} section={section} dirty={dirty} ttsCharsUsed={ttsCharsUsed} />}
    </div>
  );
}

const PINNED = PINNED_FUNCTION_REGION as FunctionRegion;

type Upload = { phase: "idle" } | { phase: "uploading"; percent: number } | { phase: "saving" } | { phase: "error"; message: string };
type Generation = { phase: "idle" } | { phase: "starting" } | { phase: "running"; chars: number; since: number } | { phase: "deleting" } | { phase: "error"; message: string };

/** The message of an Edge Function error ({ error: { message } }), or a fallback. */
async function functionError(error: unknown, fallback: string): Promise<string> {
  const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
  return (body as { error?: { message?: string } } | null)?.error?.message ?? fallback;
}

function Recording({
  testId,
  testStatus,
  orderNo,
  section,
  dirty,
  ttsCharsUsed,
}: {
  testId: string;
  testStatus: ContentStatus;
  orderNo: number;
  section: AdminListeningSection;
  dirty: boolean;
  ttsCharsUsed: number;
}) {
  const router = useRouter();
  const [upload, setUpload] = useState<Upload>({ phase: "idle" });
  const [gen, setGen] = useState<Generation>({ phase: "idle" });
  const [hashed, setHashed] = useState<{ plan: unknown; hash: string } | null>(null);
  const polling = useRef(false);
  const busy = upload.phase === "uploading" || upload.phase === "saving" || gen.phase === "starting" || gen.phase === "running" || gen.phase === "deleting";

  // What a generation would send, from the SAVED transcript and voices (what the function uses).
  const plan = useMemo(() => planSectionAudio({ transcript: section.transcript ?? "", section: orderNo, voices: section.tts_voices }), [section.transcript, section.tts_voices, orderNo]);
  const chars = plan.ok ? plan.plan.chars : 0;
  const overLimit = ttsCharsUsed + chars > TTS_CHAR_LIMIT_PER_TEST;

  // "Audio up to date" when the saved audio was generated from exactly this plan (hashed async).
  useEffect(() => {
    let live = true;
    if (plan.ok) void audioHash(plan.plan).then((hash) => live && setHashed({ plan, hash }));
    return () => {
      live = false;
    };
  }, [plan]);
  const upToDate = section.audio_source !== "generated" || !plan.ok || hashed?.plan !== plan ? null : hashed.hash === section.audio_hash;

  async function poll(jobId: string, startChars: number) {
    if (polling.current) return;
    polling.current = true;
    setGen({ phase: "running", chars: startChars, since: Date.now() });
    const supabase = createClient();
    const deadline = Date.now() + 6 * 60_000;
    try {
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1500));
        const { data, error } = await supabase.from("listening_audio_jobs").select("id, status, chars, requests, audio_url, error, created_at, finished_at").eq("id", jobId).maybeSingle();
        if (error) continue;
        const job = AudioJob.safeParse(data);
        if (!job.success || job.data.status === "running") continue;
        if (job.data.status === "succeeded") {
          toast.success(`Audio for section ${orderNo} generated (${job.data.chars.toLocaleString("en")} characters).`);
          setGen({ phase: "idle" });
          router.refresh();
        } else setGen({ phase: "error", message: job.data.error ?? "Generation failed. Try again." });
        return;
      }
      setGen({ phase: "error", message: "Generation is taking too long. Reload the page in a minute to see if it finished." });
    } finally {
      polling.current = false;
    }
  }

  // A generation still running (e.g. the page was reloaded): follow it.
  useEffect(() => {
    let live = true;
    void createClient()
      .from("listening_audio_jobs")
      .select("id, chars")
      .eq("section_id", section.id)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (live && data) void poll(data.id, data.chars);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per section
  }, [section.id]);

  async function generate() {
    const replacing = !!section.audio_url;
    if (replacing && !window.confirm(`Replace section ${orderNo}'s ${section.audio_source === "uploaded" ? "uploaded" : "current"} recording with newly generated audio?`)) return;
    setGen({ phase: "starting" });
    const { data, error } = await createClient().functions.invoke("generate-listening-audio", {
      body: { action: "generate", test_id: testId, order_no: orderNo, replace: replacing },
      region: PINNED, // the function calls Google: it only runs in the pinned region
    });
    if (error) return setGen({ phase: "error", message: await functionError(error, "Couldn't start the generation.") });
    const result = GenerateAudioResponse.safeParse(data);
    if (!result.success) return setGen({ phase: "error", message: "Unexpected reply from the generator." });
    if (result.data.status === "cached") {
      toast.success("The audio is already up to date: nothing was regenerated (no characters used).");
      setGen({ phase: "idle" });
      return;
    }
    if (result.data.status === "started") await poll(result.data.job_id, result.data.chars);
  }

  async function remove() {
    if (!window.confirm(`Delete section ${orderNo}'s recording? The file is removed from storage; the transcript and questions are kept.`)) return;
    setGen({ phase: "deleting" });
    const { error } = await createClient().functions.invoke("generate-listening-audio", { body: { action: "delete", test_id: testId, order_no: orderNo }, region: PINNED });
    if (error) return setGen({ phase: "error", message: await functionError(error, "Couldn't delete the recording.") });
    toast.success(`Recording for section ${orderNo} deleted.`);
    setGen({ phase: "idle" });
    router.refresh();
  }

  async function send(file: File) {
    if (section.audio_source === "generated" && !window.confirm("Replace the generated audio with this upload?")) return;
    const type = (R2_AUDIO_TYPES as readonly string[]).includes(file.type) ? file.type : null;
    if (!type) return setUpload({ phase: "error", message: "Use an MP3, M4A, WAV, OGG or WebM file." });
    if (file.size > R2_AUDIO_MAX_BYTES) return setUpload({ phase: "error", message: "Recordings can be 100 MB at most." });
    setUpload({ phase: "uploading", percent: 0 });

    // 1. A presigned URL for this section.
    const { data, error } = await createClient().functions.invoke("r2-upload-url", {
      body: { test_id: testId, section: orderNo, content_type: type, size_bytes: file.size },
    });
    if (error) {
      const message = await functionError(error, "Couldn't start the upload.");
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

  const published = testStatus === "published";
  const generateDisabled = busy || dirty || !section.title.trim() || !section.transcript?.trim() || !plan.ok || overLimit;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border p-4" aria-label={`Section ${orderNo} recording`} data-testid={`audio-${orderNo}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-medium">
          Recording
          {section.audio_source && (
            <Badge variant="outline" data-testid={`audio-source-${orderNo}`}>
              {section.audio_source === "generated" ? "Generated" : "Uploaded"}
            </Badge>
          )}
        </h4>
        <label className={`inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm ${busy ? "opacity-50" : "cursor-pointer hover:bg-secondary/50"}`}>
          <FileAudio className="size-4" aria-hidden />
          {section.audio_url ? "Upload a replacement" : "Upload recording"}
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
          <span className="text-xs font-medium text-muted-foreground">Listen</span>
          <audio controls preload="metadata" src={section.audio_url} className="w-full" aria-label={`Section ${orderNo} recording`} />
          <span className="text-xs text-muted-foreground">
            {section.duration_sec ? `${Math.floor(section.duration_sec / 60)}:${String(section.duration_sec % 60).padStart(2, "0")} · ` : ""}
            {section.audio_source === "generated" && section.audio_chars ? `${section.audio_chars.toLocaleString("en")} characters · ` : ""}
            <span className="break-all">{section.audio_url}</span>
          </span>
          {upToDate !== null && (
            <span className={`text-sm ${upToDate ? "text-primary" : "text-amber-700"}`} data-testid={`audio-status-${orderNo}`}>
              {upToDate ? "Audio up to date" : "Transcript changed since audio was generated"}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No recording yet. Generate it from the transcript, or upload one: MP3, M4A, WAV, OGG or WebM, up to 100 MB.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void generate()} disabled={generateDisabled} data-testid={`generate-audio-${orderNo}`}>
            <Wand2 /> {section.audio_url ? "Regenerate audio" : "Generate audio"}
          </Button>
          {section.audio_url && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void remove()}
              disabled={busy || published}
              title={published ? "Unpublish the test first" : undefined}
              data-testid={`delete-audio-${orderNo}`}
            >
              <Trash2 /> Delete audio
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground" data-testid={`audio-estimate-${orderNo}`}>
          {!plan.ok
            ? plan.error
            : dirty
              ? "Save the section first: audio is generated from the saved title and transcript."
              : `About ${chars.toLocaleString("en")} characters (≈ $${estimateCostUsd(chars).toFixed(3)} with Standard voices). This test has used ${ttsCharsUsed.toLocaleString("en")} of ${TTS_CHAR_LIMIT_PER_TEST.toLocaleString("en")} characters.`}
          {plan.ok && overLimit && !dirty && <span className="text-destructive"> That would go over the test&apos;s limit.</span>}
        </p>
        {published && section.audio_url && (
          <p className="text-xs text-amber-700">This test is published: move it back to draft before deleting its audio.</p>
        )}
      </div>

      {gen.phase === "starting" && (
        <p className="text-sm text-muted-foreground" role="status">
          Starting…
        </p>
      )}
      {gen.phase === "running" && (
        <div className="flex items-center gap-3" role="status" aria-live="polite" data-testid={`audio-progress-${orderNo}`}>
          <AudioLines className="size-4 animate-pulse" aria-hidden />
          <progress className="h-2 flex-1 accent-primary" aria-label="Generating audio" />
          <span className="text-sm">Generating {gen.chars.toLocaleString("en")} characters…</span>
        </div>
      )}
      {gen.phase === "deleting" && (
        <p className="text-sm text-muted-foreground" role="status">
          Deleting…
        </p>
      )}
      {gen.phase === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {gen.message}
        </p>
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
