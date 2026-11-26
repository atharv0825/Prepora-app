// Gemini client for AI Edge Functions (M6-B1): one JSON-producing call with timeouts, retries,
// schema validation, token usage and cost. score-writing (M6-B3), ocr-writing (M6-B4) and the
// Speaking functions (M7) call generateJson() inside withCredits (M3-B6):
//
//   return await withCredits(ctx, "writing_t2", async () => {
//     const out = await generateJson({ model: GEMINI_MODELS.scoring, system, parts, schema: ScoredWriting });
//     return { result: out.data, usage: out.usage };
//   });
//
// REST, no SDK (one fewer dependency to pin): POST
//   https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// with the key in the x-goog-api-key header, generationConfig.responseMimeType =
// "application/json" and responseJsonSchema (made from the Zod schema). The model's reply is
// parsed and validated with the same Zod schema: Gemini ignores some JSON Schema constraints
// (string lengths, refinements), so validation is what makes the output trustworthy.
//
// Failures and retries (each attempt has its own timeout; all attempts fit in one deadline):
//   * 408, 429 and 5xx except 504, network errors, timeouts → retried with backoff (Retry-After
//     honoured, capped). 504 is not retried: the call was slow, a second one doubles the bill.
//   * Reply that isn't valid JSON or fails the schema (finishReason STOP) → retried: the model
//     is nondeterministic and usually gets it right the second time.
//   * 400/401/403/404 (bad request, key, model), a blocked prompt, a SAFETY/RECITATION/… finish,
//     or MAX_TOKENS (a cut-off reply won't fit next time either) → no retry.
// Every failure throws AiCallError carrying the usage of ALL attempts (failed calls with a reply
// are billed), so withCredits logs the real cost before refunding the student.
//
// No temperature/topP/topK: Gemini 3.6+ ignores them and Google says they'll become a 400.
// Never log prompts or replies: they contain students' writing.

import { z, type ZodType } from "./deps.ts";
import { AiCallError, type AiUsage } from "./credits.ts";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Models by job (plan §1, §2.6). Change here, and in credit_costs.model, together. */
export const GEMINI_MODELS = {
  /** Writing and Speaking scoring, content generation. */
  scoring: "gemini-3.8-flash",
  /** OCR and examiner turns. */
  lite: "gemini-3.5-flash-lite",
} as const;

/**
 * US$ per 1M tokens, paid tier, from the plan's cost table (§2.6): Flash $1.50 in / $7.50 out,
 * Flash-Lite $0.30 in / $2.50 out. Thinking tokens are billed as output. Confirm against Google's
 * pricing page when it changes; ai_usage.cost_usd is computed from this.
 */
export const GEMINI_PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export type ThinkingLevel = "minimal" | "low" | "medium" | "high";

/** A part of the user's message: text, or an inline image/PDF (base64, ≤ ~20 MB per request). */
export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface GenerateJsonOptions<T> {
  model: string;
  /** The system instruction (rubric, rules). */
  system?: string;
  /** The user's message. */
  parts: GeminiPart[];
  /** Validates the reply; also sent to Gemini as responseJsonSchema unless jsonSchema is given. */
  schema: ZodType<T>;
  jsonSchema?: Record<string, unknown>;
  /** Thinking effort (Gemini 3+). Left out = the model's default. */
  thinkingLevel?: ThinkingLevel;
  /** Output cap, thinking included. */
  maxOutputTokens?: number;
  /** Per attempt (default 60 s). */
  timeoutMs?: number;
  /** All attempts together (default 120 s; Edge Functions stop at 150 s on the free plan). */
  deadlineMs?: number;
  /** Total attempts, first included (default 3). */
  maxAttempts?: number;
  /** Stops waiting when the request is cancelled. */
  signal?: AbortSignal;
}

export interface GenerateJsonResult<T> {
  data: T;
  /** Summed over all attempts, for withCredits / ai_usage. */
  usage: AiUsage & { input_tokens: number; output_tokens: number; cost_usd: number };
  attempts: number;
}

/** Injectable for tests. */
export interface GeminiDeps {
  fetch: typeof fetch;
  apiKey: string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

type UsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
};

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: UsageMetadata;
  modelVersion?: string;
};

/** Base64 for inlineData (images, PDFs), in chunks so large files don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Cost in US$ of a call's tokens (0 for a model without a price, so a typo can't crash a call). */
export function geminiCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = GEMINI_PRICES[model];
  if (!price) return 0;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

/** Zod → the JSON Schema Gemini takes (no $schema key; constraints it ignores are harmless). */
export function toGeminiJsonSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "output" }) as Record<
    string,
    unknown
  >;
  return rest;
}

export function buildRequestBody(opts: GenerateJsonOptions<unknown>): Record<string, unknown> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: opts.jsonSchema ?? toGeminiJsonSchema(opts.schema),
  };
  if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
  if (opts.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: opts.thinkingLevel.toUpperCase() };
  return {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: "user", parts: opts.parts }],
    generationConfig,
  };
}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503]);
const BACKOFF_BASE_MS = 750;
const BACKOFF_CAP_MS = 8_000;

class Attempt extends Error {
  constructor(message: string, readonly retry: boolean, readonly retryAfterMs?: number) {
    super(message);
  }
}

function resolveDeps(deps: Partial<GeminiDeps> = {}): GeminiDeps {
  const apiKey = deps.apiKey ?? Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (supabase secrets set GEMINI_API_KEY=…; see docs/gemini.md)");
  return {
    fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
    apiKey,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps.now ?? (() => Date.now()),
    random: deps.random ?? Math.random,
  };
}

function retryAfterMs(res: Response): number | undefined {
  const v = res.headers.get("retry-after");
  if (!v) return undefined;
  const s = Number(v);
  if (Number.isFinite(s)) return Math.max(0, s * 1000);
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : Math.max(0, t - Date.now());
}

/** One JSON reply from Gemini, validated by `schema`. Throws AiCallError (with usage) on failure. */
export async function generateJson<T>(opts: GenerateJsonOptions<T>, deps?: Partial<GeminiDeps>): Promise<GenerateJsonResult<T>> {
  const d = resolveDeps(deps);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const deadline = d.now() + (opts.deadlineMs ?? 120_000);
  const body = JSON.stringify(buildRequestBody(opts as GenerateJsonOptions<unknown>));
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(opts.model)}:generateContent`;

  let inputTokens = 0;
  let outputTokens = 0;
  const usage = () => ({
    model: opts.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: geminiCostUsd(opts.model, inputTokens, outputTokens),
  });

  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - d.now();
    if (remaining <= 0) break;
    if (opts.signal?.aborted) throw new AiCallError("Gemini call cancelled", usage());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const data = await callOnce<T>(d, url, body, controller.signal, opts.schema, (u) => {
        inputTokens += (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0);
        outputTokens += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
      });
      return { data, usage: usage(), attempts: attempt };
    } catch (err) {
      const a = err instanceof Attempt
        ? err
        : controller.signal.aborted
        ? new Attempt(opts.signal?.aborted ? "cancelled" : `timed out after ${Math.min(timeoutMs, remaining)} ms`, !opts.signal?.aborted)
        : new Attempt(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
      lastError = a.message;
      if (!a.retry || attempt === maxAttempts) {
        throw new AiCallError(`Gemini ${opts.model}: ${a.message} (attempt ${attempt})`, usage(), { cause: err });
      }
      const backoff = Math.min(BACKOFF_CAP_MS, a.retryAfterMs ?? BACKOFF_BASE_MS * 2 ** (attempt - 1) * (0.5 + d.random()));
      if (d.now() + backoff >= deadline) break;
      await d.sleep(backoff);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new AiCallError(`Gemini ${opts.model}: deadline reached (last: ${lastError})`, usage());
}

async function callOnce<T>(
  d: GeminiDeps,
  url: string,
  body: string,
  signal: AbortSignal,
  schema: ZodType<T>,
  addUsage: (u: UsageMetadata) => void,
): Promise<T> {
  const res = await d.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": d.apiKey },
    body,
    signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    // The error body says why (bad schema, quota, key); never echo the request.
    let reason = "";
    try {
      const e = JSON.parse(raw)?.error;
      reason = [e?.status ?? e?.code, e?.message].filter(Boolean).join(": ").slice(0, 300);
    } catch { /* not JSON */ }
    throw new Attempt(`HTTP ${res.status}${reason ? ` ${reason}` : ""}`, RETRY_STATUS.has(res.status), retryAfterMs(res));
  }

  let json: GenerateContentResponse;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Attempt("response wasn't JSON", true);
  }
  if (json.usageMetadata) addUsage(json.usageMetadata);
  if (json.promptFeedback?.blockReason) throw new Attempt(`prompt blocked (${json.promptFeedback.blockReason})`, false);

  const candidate = json.candidates?.[0];
  const finish = candidate?.finishReason ?? "none";
  if (finish === "MAX_TOKENS") throw new Attempt("reply cut off (MAX_TOKENS)", false);
  if (finish !== "STOP") throw new Attempt(`no usable reply (finishReason ${finish})`, finish === "OTHER" || finish === "none");

  const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Attempt("reply wasn't valid JSON", true);
  }
  const checked = schema.safeParse(parsed);
  if (!checked.success) {
    const where = checked.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new Attempt(`reply didn't match the schema (${where})`, true);
  }
  return checked.data;
}
