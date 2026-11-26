// DeepSeek adapter for ai.ts: the default provider.
//
// OpenAI-compatible chat completions: POST https://api.deepseek.com/chat/completions with
// "Authorization: Bearer <DEEPSEEK_API_KEY>". `deepseek-flash` takes text and images (JPEG, PNG,
// GIF, WebP as base64 data URLs; no HEIC).
//
// JSON: response_format { type: "json_object" } only makes the reply a JSON object; there's no
// schema enforcement. The docs ask for the word "json" and the expected format in the prompt, so
// the JSON Schema is appended to the system message, and ai.ts validates the reply with Zod.
// Known quirk: content can come back blank with finish_reason "stop"; that's retried.
//
// Thinking is a parameter: thinking { type: enabled | disabled } and reasoning_effort (low | high).
// Reasoning tokens are part of completion_tokens and billed as output.
//
// Prices (US$ per 1M tokens, peak; off-peak is half): deepseek-flash input $0.30 (cache hit
// $0.006), output $1.20. Peak = Mon–Fri 01:00–04:00 and 06:00–10:00 UTC (Chinese public holidays,
// which are off-peak, are ignored here, so those days are slightly overestimated). From the
// DeepSeek pricing page, 2026-11-26: update DEEPSEEK_PRICES when it changes.
import type { GenerateJsonOptions, ParsedReply, ProviderAdapter, TokenUsage } from "./ai.ts";

export const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

export const DEEPSEEK_PRICES: Record<string, { hit: number; miss: number; output: number }> = {
  "deepseek-flash": { hit: 0.006, miss: 0.3, output: 1.2 },
  "deepseek-v4-pro": { hit: 0.044, miss: 1.32, output: 3.96 },
};

/** Peak hours (full price): Mon–Fri, 01:00–04:00 and 06:00–10:00 UTC. */
export function isDeepseekPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = at.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

export function deepseekCost(model: string, u: TokenUsage, at: Date): number {
  const p = DEEPSEEK_PRICES[model];
  if (!p) return 0;
  const factor = isDeepseekPeak(at) ? 1 : 0.5;
  const miss = Math.max(0, u.input - u.cachedInput);
  return ((miss * p.miss + u.cachedInput * p.hit + u.output * p.output) * factor) / 1_000_000;
}

type ChatResponse = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
  };
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

export const deepseek: ProviderAdapter = {
  name: "deepseek",
  keyEnv: "DEEPSEEK_API_KEY",
  imageTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  retryStatus: new Set([408, 429, 500, 502, 503, 504]),

  request(opts: GenerateJsonOptions<unknown>, jsonSchema: Record<string, unknown>, apiKey: string) {
    const system = [
      opts.system?.trim(),
      `Reply with a single JSON object (json, no markdown) that matches this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`,
    ].filter(Boolean).join("\n\n");
    const content = opts.parts.map((p) =>
      "text" in p
        ? { type: "text", text: p.text }
        : { type: "image_url", image_url: { url: `data:${p.image.mimeType};base64,${p.image.data}` } }
    );
    const body: Record<string, unknown> = {
      model: opts.model.model,
      messages: [{ role: "system", content: system }, { role: "user", content }],
      response_format: { type: "json_object" },
      stream: false,
    };
    if (opts.maxOutputTokens) body.max_tokens = opts.maxOutputTokens;
    if (opts.thinking === "off") body.thinking = { type: "disabled" };
    else if (opts.thinking) {
      body.thinking = { type: "enabled" };
      body.reasoning_effort = opts.thinking;
    }
    return {
      url: DEEPSEEK_API_URL,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      },
    };
  },

  parse(json: unknown): ParsedReply {
    const r = json as ChatResponse;
    const u = r.usage ?? {};
    const input = n(u.prompt_tokens) || n(u.prompt_cache_hit_tokens) + n(u.prompt_cache_miss_tokens);
    const usage: TokenUsage = { input, cachedInput: Math.min(input, n(u.prompt_cache_hit_tokens)), output: n(u.completion_tokens) };
    const choice = r.choices?.[0];
    const finish = choice?.finish_reason ?? "none";
    const text = choice?.message?.content ?? "";
    if (finish === "length") return { ok: false, reason: "reply cut off (finish_reason length)", retry: false, usage };
    if (finish === "content_filter") return { ok: false, reason: "blocked by the content filter", retry: false, usage };
    if (finish !== "stop") {
      // insufficient_system_resource, aborted, none: transient.
      return { ok: false, reason: `no usable reply (finish_reason ${finish})`, retry: true, usage };
    }
    if (!text.trim()) return { ok: false, reason: "blank reply", retry: true, usage };
    return { ok: true, text, usage };
  },

  cost: deepseekCost,
};
