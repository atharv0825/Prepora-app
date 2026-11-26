// AI client for Edge Functions: one JSON-producing call with timeouts, retries, schema validation,
// token usage and cost, whatever the provider. score-writing (M6-B3), ocr-writing (M6-B4) and the
// Speaking functions (M7) call generateJson() inside withCredits (M3-B6):
//
//   const model = aiModel("scoring");
//   return await withCredits(ctx, "writing_t2", async () => {
//     const out = await generateJson({ model, system, parts, schema: ScoredWriting });
//     return { result: out.data, usage: out.usage };
//   });
//
// Providers (adapters in ai_deepseek.ts and ai_gemini.ts):
//   * DeepSeek, the default: `deepseek-flash` (text and images, JSON object mode).
//   * Gemini (M6-B1), kept as an alternative: set the AI_PROVIDER secret to "gemini".
// Each provider's key is its own secret (DEEPSEEK_API_KEY, GEMINI_API_KEY); see docs/ai.md.
//
// The reply is parsed and validated with the caller's Zod schema, whichever provider: DeepSeek's
// JSON mode doesn't enforce a schema at all, and Gemini ignores some constraints, so validation is
// what makes the output trustworthy.
//
// Failures and retries (each attempt has its own timeout; all attempts fit in one deadline):
//   * The provider's transient HTTP statuses (429, 5xx, …), network errors, timeouts → retried with
//     backoff (Retry-After honoured, capped).
//   * A reply that's blank, isn't valid JSON or fails the schema → retried: the model is
//     nondeterministic and usually gets it right the second time.
//   * Bad request, key or balance, a blocked prompt or content filter, or a reply cut off at the
//     token limit (it won't fit next time either) → no retry.
// Every failure throws AiCallError carrying the usage of ALL attempts (failed calls with a reply
// are billed), so withCredits logs the real cost before refunding the student.
//
// No temperature/top_p: both providers ignore them in thinking mode. Never log prompts or replies:
// they contain students' writing.

import { z, type ZodType } from "./deps.ts";
import { AiCallError, type AiUsage } from "./credits.ts";
import { deepseek } from "./ai_deepseek.ts";
import { gemini } from "./ai_gemini.ts";

export type AiProvider = "deepseek" | "gemini";
export type AiJob = "scoring" | "lite";
export interface AiModel {
  provider: AiProvider;
  model: string;
}

/** Models by job and provider. "scoring": Writing/Speaking feedback, generation. "lite": OCR, examiner turns. */
export const AI_MODELS: Record<AiProvider, Record<AiJob, string>> = {
  deepseek: { scoring: "deepseek-flash", lite: "deepseek-flash" },
  gemini: { scoring: "gemini-3.8-flash", lite: "gemini-3.5-flash-lite" },
};
export const DEFAULT_PROVIDER: AiProvider = "deepseek";

/** A part of the user's message: text, or an inline image (base64). */
export type AiPart = { text: string } | { image: { mimeType: string; data: string } };

/** Thinking effort. Left out = the provider's default. */
export type Thinking = "off" | "low" | "high";

export interface GenerateJsonOptions<T> {
  model: AiModel;
  /** The system instruction (rubric, rules). */
  system?: string;
  /** The user's message. */
  parts: AiPart[];
  /** Validates the reply; also given to the model as a JSON Schema unless jsonSchema is given. */
  schema: ZodType<T>;
  jsonSchema?: Record<string, unknown>;
  thinking?: Thinking;
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

/** Tokens of one call: input (cached input is part of it), cached input, output (thinking included). */
export interface TokenUsage {
  input: number;
  cachedInput: number;
  output: number;
}

/** What an adapter makes of one HTTP reply. */
export type ParsedReply =
  | { ok: true; text: string; usage: TokenUsage }
  | { ok: false; reason: string; retry: boolean; usage: TokenUsage };

/** One provider: how to call it and how to read its replies. */
export interface ProviderAdapter {
  name: AiProvider;
  /** The secret holding the API key. */
  keyEnv: string;
  /** Image types the provider accepts inline. */
  imageTypes: ReadonlySet<string>;
  /** HTTP statuses worth retrying. */
  retryStatus: ReadonlySet<number>;
  request(opts: GenerateJsonOptions<unknown>, jsonSchema: Record<string, unknown>, apiKey: string): { url: string; init: RequestInit };
  parse(json: unknown): ParsedReply;
  /** US$ for a call's tokens at a given time (some providers price by time of day). */
  cost(model: string, usage: TokenUsage, at: Date): number;
}

export const ADAPTERS: Record<AiProvider, ProviderAdapter> = { deepseek, gemini };

/** Injectable for tests. */
export interface AiDeps {
  fetch: typeof fetch;
  apiKey: string;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  random: () => number;
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name) || undefined;
  } catch {
    return undefined; // no env permission (unit tests)
  }
}

/** The provider in use: the AI_PROVIDER secret if it names one, else DeepSeek. */
export function currentProvider(): AiProvider {
  const p = env("AI_PROVIDER");
  return p === "gemini" || p === "deepseek" ? p : DEFAULT_PROVIDER;
}

/** The model for a job with the current (or given) provider. */
export function aiModel(job: AiJob, provider: AiProvider = currentProvider()): AiModel {
  return { provider, model: AI_MODELS[provider][job] };
}

/** True when the provider's key is set: functions check it before spending credits. */
export function aiConfigured(model: AiModel): boolean {
  return Boolean(env(ADAPTERS[model.provider].keyEnv));
}

/** Zod → JSON Schema (no $schema key; constraints a provider ignores are harmless). */
export function toJsonSchema(schema: ZodType): Record<string, unknown> {
  const { $schema: _drop, ...rest } = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any", io: "output" }) as Record<
    string,
    unknown
  >;
  return rest;
}

/** Base64 for inline images, in chunks so large files don't overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const BACKOFF_BASE_MS = 750;
const BACKOFF_CAP_MS = 8_000;

class Attempt extends Error {
  constructor(message: string, readonly retry: boolean, readonly retryAfterMs?: number) {
    super(message);
  }
}

function resolveDeps(adapter: ProviderAdapter, deps: Partial<AiDeps> = {}): AiDeps {
  const apiKey = deps.apiKey ?? env(adapter.keyEnv);
  if (!apiKey) throw new Error(`${adapter.keyEnv} is not set (supabase secrets set ${adapter.keyEnv}=…; see docs/ai.md)`);
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

/** One JSON reply from the model, validated by `schema`. Throws AiCallError (with usage) on failure. */
export async function generateJson<T>(opts: GenerateJsonOptions<T>, deps?: Partial<AiDeps>): Promise<GenerateJsonResult<T>> {
  const adapter = ADAPTERS[opts.model.provider];
  const d = resolveDeps(adapter, deps);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const deadline = d.now() + (opts.deadlineMs ?? 120_000);
  const { url, init } = adapter.request(opts as GenerateJsonOptions<unknown>, opts.jsonSchema ?? toJsonSchema(opts.schema), d.apiKey);
  const label = `${adapter.name} ${opts.model.model}`;

  const total: TokenUsage = { input: 0, cachedInput: 0, output: 0 };
  let cost = 0;
  const add = (u: TokenUsage) => {
    total.input += u.input;
    total.cachedInput += u.cachedInput;
    total.output += u.output;
    cost += adapter.cost(opts.model.model, u, new Date(d.now()));
  };
  const usage = () => ({ model: opts.model.model, input_tokens: total.input, output_tokens: total.output, cost_usd: cost });

  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - d.now();
    if (remaining <= 0) break;
    if (opts.signal?.aborted) throw new AiCallError(`${label}: cancelled`, usage());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
    const onAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const data = await callOnce(d, adapter, url, init, controller.signal, opts.schema, add);
      return { data, usage: usage(), attempts: attempt };
    } catch (err) {
      const a = err instanceof Attempt
        ? err
        : controller.signal.aborted
        ? new Attempt(opts.signal?.aborted ? "cancelled" : `timed out after ${Math.min(timeoutMs, remaining)} ms`, !opts.signal?.aborted)
        : new Attempt(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
      lastError = a.message;
      if (!a.retry || attempt === maxAttempts) {
        throw new AiCallError(`${label}: ${a.message} (attempt ${attempt})`, usage(), { cause: err });
      }
      const backoff = Math.min(BACKOFF_CAP_MS, a.retryAfterMs ?? BACKOFF_BASE_MS * 2 ** (attempt - 1) * (0.5 + d.random()));
      if (d.now() + backoff >= deadline) break;
      await d.sleep(backoff);
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
    }
  }
  throw new AiCallError(`${label}: deadline reached (last: ${lastError})`, usage());
}

async function callOnce<T>(
  d: AiDeps,
  adapter: ProviderAdapter,
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  schema: ZodType<T>,
  add: (u: TokenUsage) => void,
): Promise<T> {
  const res = await d.fetch(url, { ...init, signal });
  const raw = await res.text();
  if (!res.ok) {
    // The error body says why (bad request, quota, key); never echo the request.
    let reason = "";
    try {
      const e = JSON.parse(raw)?.error;
      reason = [e?.status ?? e?.type ?? e?.code, e?.message].filter(Boolean).join(": ").slice(0, 300);
    } catch { /* not JSON */ }
    throw new Attempt(`HTTP ${res.status}${reason ? ` ${reason}` : ""}`, adapter.retryStatus.has(res.status), retryAfterMs(res));
  }

  let json: unknown;
  try {
    // DeepSeek may send blank keep-alive lines before the body; JSON.parse skips leading whitespace.
    json = JSON.parse(raw);
  } catch {
    throw new Attempt("response wasn't JSON", true);
  }
  const reply = adapter.parse(json);
  add(reply.usage);
  if (!reply.ok) throw new Attempt(reply.reason, reply.retry);

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.text);
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
