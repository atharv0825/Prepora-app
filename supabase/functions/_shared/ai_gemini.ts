// Gemini adapter for ai.ts (M6-B1). Gemini does everything with images, audio or voice (DeepSeek
// takes text only): OCR of Writing photos (ocr-writing, pinned to Gemini) and speech to text
// (stt.ts). Text jobs can be moved to it with AI_PROVIDER=gemini.
//
// REST generateContent: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// with the key in x-goog-api-key, generationConfig.responseMimeType = "application/json" and
// responseJsonSchema (Gemini follows the schema; ai.ts still validates with Zod). Thinking:
// thinkingConfig.thinkingLevel (Gemini 3+). Thinking tokens are billed as output.
// 504 isn't retried: the call was slow, and a second one doubles the bill.
//
// Prices (US$ per 1M tokens, paid tier, from the plan's cost table §2.6): Flash $1.50 in / $7.50
// out, Flash-Lite $0.30 / $2.50. Use a paid-tier key for real users (privacy, plan §2.6).
import type { GenerateJsonOptions, ParsedReply, ProviderAdapter, TokenUsage } from "./ai.ts";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Where requests go: Gemini, or the GEMINI_API_URL secret when set (CI points it at the ai-stub). */
export function geminiApiBase(): string {
  try {
    return Deno.env.get("GEMINI_API_URL") || GEMINI_API_BASE;
  } catch {
    return GEMINI_API_BASE; // no env permission (unit tests)
  }
}

export const GEMINI_PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export function geminiCost(model: string, u: TokenUsage): number {
  const p = GEMINI_PRICES[model];
  if (!p) return 0;
  return (u.input * p.input + u.output * p.output) / 1_000_000;
}

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    toolUsePromptTokenCount?: number;
    cachedContentTokenCount?: number;
  };
};

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const LEVEL = { off: "MINIMAL", low: "LOW", high: "HIGH" } as const;

export const gemini: ProviderAdapter = {
  name: "gemini",
  keyEnv: "GEMINI_API_KEY",
  imageTypes: new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]),
  retryStatus: new Set([408, 429, 500, 502, 503]),

  request(opts: GenerateJsonOptions<unknown>, jsonSchema: Record<string, unknown>, apiKey: string) {
    const generationConfig: Record<string, unknown> = { responseMimeType: "application/json", responseJsonSchema: jsonSchema };
    if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
    if (opts.thinking) generationConfig.thinkingConfig = { thinkingLevel: LEVEL[opts.thinking] };
    const parts = opts.parts.map((p) => ("text" in p ? { text: p.text } : { inlineData: { mimeType: p.image.mimeType, data: p.image.data } }));
    const body = {
      ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
      contents: [{ role: "user", parts }],
      generationConfig,
    };
    return {
      url: `${geminiApiBase()}/models/${encodeURIComponent(opts.model.model)}:generateContent`,
      init: {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      },
    };
  },

  parse(json: unknown): ParsedReply {
    const r = json as GenerateContentResponse;
    const m = r.usageMetadata ?? {};
    const usage: TokenUsage = {
      input: n(m.promptTokenCount) + n(m.toolUsePromptTokenCount),
      cachedInput: n(m.cachedContentTokenCount),
      output: n(m.candidatesTokenCount) + n(m.thoughtsTokenCount),
    };
    if (r.promptFeedback?.blockReason) return { ok: false, reason: `prompt blocked (${r.promptFeedback.blockReason})`, retry: false, usage };
    const candidate = r.candidates?.[0];
    const finish = candidate?.finishReason ?? "none";
    if (finish === "MAX_TOKENS") return { ok: false, reason: "reply cut off (MAX_TOKENS)", retry: false, usage };
    if (finish !== "STOP") {
      return { ok: false, reason: `no usable reply (finishReason ${finish})`, retry: finish === "OTHER" || finish === "none", usage };
    }
    const text = (candidate?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
    if (!text.trim()) return { ok: false, reason: "blank reply", retry: true, usage };
    return { ok: true, text, usage };
  },

  cost: (model, usage) => geminiCost(model, usage),
};
