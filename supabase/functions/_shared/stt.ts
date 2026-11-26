// Speech to text for Speaking (M7-B1): Groq Whisper (`whisper-large-v3-turbo`) with word timings.
// score-speaking (M7-B3) transcribes the student's recording here, then measures the signals
// (speaking.ts, M7-B2) and has the AI (ai.ts) score the transcript. DeepSeek takes no audio, so
// transcription is its own provider.
//
// API (OpenAI-compatible, multipart/form-data): POST https://api.groq.com/openai/v1/audio/transcriptions
// with "Authorization: Bearer <GROQ_API_KEY>", fields model, file, response_format=verbose_json,
// timestamp_granularities[]=word and =segment, language, prompt, temperature. The reply has the text,
// segments (with avg_logprob / no_speech_prob: how sure the model was) and words with start/end
// seconds. Formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm; 25 MB per file (free tier).
//
// Fillers: Whisper tends to leave out "um" and "uh". The prompt is written with fillers, which
// nudges it to keep them (the documented way to steer its style); the eval (M7-B5) checks this.
//
// Price: $0.04 per hour of audio, at least 10 s billed per request; server errors aren't charged.
// Retries like ai.ts: 429 (Retry-After), 498, 500, 502, 503, network errors and timeouts; not
// 400/401/403/404/413/422. Failures throw AiCallError with the usage, so withCredits logs it.
// GROQ_API_URL overrides the endpoint (a stub in CI, as DEEPSEEK_API_URL for ai.ts).

import { z } from "./deps.ts";
import { AiCallError, type AiUsage } from "./credits.ts";

export const GROQ_TRANSCRIPTIONS_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const STT_MODEL = "whisper-large-v3-turbo";
/** US$ per hour of audio, per model (Groq's speech-to-text page, 2026-11-26). */
export const STT_PRICES: Record<string, number> = { "whisper-large-v3-turbo": 0.04, "whisper-large-v3": 0.111 };
const MIN_BILLED_SEC = 10;

/** Written with hesitations so Whisper keeps the student's fillers instead of tidying them away. */
export const FILLER_PROMPT = "Umm, let me think, uh... So, you know, I mean, er, it's like... hmm, okay.";

export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export type Word = { word: string; start: number; end: number };
export type Segment = { start: number; end: number; text: string; avg_logprob: number | null; no_speech_prob: number | null };

export interface Transcript {
  text: string;
  language: string | null;
  /** Length of the audio in seconds (from the reply, else the last segment's end). */
  duration_sec: number;
  words: Word[];
  segments: Segment[];
  usage: AiUsage & { audio_seconds: number; cost_usd: number };
}

export interface TranscribeOptions {
  audio: Blob;
  /** The recording's type; sets the file name's extension Groq reads the format from. */
  mimeType: string;
  /** ISO-639-1; English answers (IELTS). Improves accuracy and speed. */
  language?: string;
  prompt?: string;
  model?: string;
  /** Per attempt (default 60 s). */
  timeoutMs?: number;
  /** All attempts together (default 90 s). */
  deadlineMs?: number;
  maxAttempts?: number;
}

export interface SttDeps {
  fetch: typeof fetch;
  apiKey: string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
  url: string;
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name) || undefined;
  } catch {
    return undefined; // no env permission (unit tests)
  }
}

export function sttConfigured(): boolean {
  return Boolean(env("GROQ_API_KEY"));
}

/** US$ for one transcription of `audioSec` seconds (at least 10 s billed). */
export function sttCost(model: string, audioSec: number): number {
  const perHour = STT_PRICES[model];
  if (!perHour || !(audioSec > 0)) return 0; // nothing transcribed (a failed request) costs nothing
  return (Math.max(MIN_BILLED_SEC, audioSec) / 3600) * perHour;
}

// The reply, read leniently (only what we use; unknown fields ignored).
const num = z.number().finite();
const Reply = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: num.nullish(),
  segments: z
    .array(z.object({ start: num, end: num, text: z.string(), avg_logprob: num.nullish(), no_speech_prob: num.nullish() }))
    .nullish(),
  words: z.array(z.object({ word: z.string(), start: num, end: num })).nullish(),
});

const RETRY = new Set([429, 498, 500, 502, 503]);

class Attempt extends Error {
  constructor(message: string, readonly retry: boolean, readonly retryAfterMs?: number) {
    super(message);
  }
}

function resolveDeps(deps: Partial<SttDeps> = {}): SttDeps {
  const apiKey = deps.apiKey ?? env("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not set (supabase secrets set GROQ_API_KEY=…; see docs/ai.md)");
  return {
    fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
    apiKey,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps.now ?? (() => Date.now()),
    random: deps.random ?? Math.random,
    url: deps.url ?? env("GROQ_API_URL") ?? GROQ_TRANSCRIPTIONS_URL,
  };
}

/** The multipart body Groq expects. */
export function transcriptionForm(o: TranscribeOptions): FormData {
  const ext = AUDIO_TYPES[o.mimeType.split(";")[0]!.trim()] ?? "webm";
  const form = new FormData();
  form.append("model", o.model ?? STT_MODEL);
  form.append("file", o.audio, `answer.${ext}`);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  form.append("language", o.language ?? "en");
  form.append("temperature", "0");
  form.append("prompt", o.prompt ?? FILLER_PROMPT);
  return form;
}

/** The transcript with word timings. Throws AiCallError (with usage) when it can't get one. */
export async function transcribe(o: TranscribeOptions, deps?: Partial<SttDeps>): Promise<Transcript> {
  if (!AUDIO_TYPES[o.mimeType.split(";")[0]!.trim()]) throw new Error(`Unsupported audio type: ${o.mimeType}`);
  const d = resolveDeps(deps);
  const model = o.model ?? STT_MODEL;
  const timeoutMs = o.timeoutMs ?? 60_000;
  const maxAttempts = Math.max(1, o.maxAttempts ?? 3);
  const deadline = d.now() + (o.deadlineMs ?? 90_000);
  const usage = (audioSec: number) => ({ model, audio_seconds: audioSec, cost_usd: sttCost(model, audioSec) });

  let last = "no attempt made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - d.now();
    if (remaining <= 0) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    try {
      const res = await d.fetch(d.url, {
        method: "POST",
        headers: { authorization: `Bearer ${d.apiKey}` },
        body: transcriptionForm(o), // a fresh body per attempt
        signal: controller.signal,
      });
      const raw = await res.text();
      if (!res.ok) {
        let reason = "";
        try {
          const e = JSON.parse(raw)?.error;
          reason = [e?.type ?? e?.code, e?.message].filter(Boolean).join(": ").slice(0, 300);
        } catch { /* not JSON */ }
        const after = Number(res.headers.get("retry-after"));
        throw new Attempt(`HTTP ${res.status}${reason ? ` ${reason}` : ""}`, RETRY.has(res.status), Number.isFinite(after) && after > 0 ? after * 1000 : undefined);
      }
      let parsed: z.infer<typeof Reply>;
      try {
        parsed = Reply.parse(JSON.parse(raw));
      } catch {
        throw new Attempt("unexpected transcription reply", true);
      }
      const segments: Segment[] = (parsed.segments ?? []).map((s) => ({
        start: s.start,
        end: s.end,
        text: s.text.trim(),
        avg_logprob: s.avg_logprob ?? null,
        no_speech_prob: s.no_speech_prob ?? null,
      }));
      const words = (parsed.words ?? []).map((w) => ({ word: w.word.trim(), start: w.start, end: w.end })).filter((w) => w.word);
      const duration = parsed.duration ?? segments.at(-1)?.end ?? words.at(-1)?.end ?? 0;
      return { text: parsed.text.trim(), language: parsed.language ?? null, duration_sec: duration, words, segments, usage: usage(duration) };
    } catch (err) {
      const a = err instanceof Attempt
        ? err
        : controller.signal.aborted
        ? new Attempt(`timed out after ${Math.min(timeoutMs, remaining)} ms`, true)
        : new Attempt(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
      last = a.message;
      // Failed requests aren't billed (server errors, timeouts); usage is zero.
      if (!a.retry || attempt === maxAttempts) throw new AiCallError(`groq ${model}: ${a.message} (attempt ${attempt})`, usage(0), { cause: err });
      const backoff = Math.min(8_000, a.retryAfterMs ?? 750 * 2 ** (attempt - 1) * (0.5 + d.random()));
      if (d.now() + backoff >= deadline) break;
      await d.sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AiCallError(`groq ${model}: deadline reached (last: ${last})`, usage(0));
}
