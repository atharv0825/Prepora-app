// Unit tests for the AI client (ai.ts) and both adapters, with a fake fetch: no network, no key.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { z } from "./deps.ts";
import { AiCallError } from "./credits.ts";
import { type AiDeps, aiModel, bytesToBase64, currentProvider, generateJson, toJsonSchema } from "./ai.ts";
import { deepseek, deepseekCost, isDeepseekPeak } from "./ai_deepseek.ts";
import { gemini, geminiCost } from "./ai_gemini.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}
async function rejects(fn: () => Promise<unknown>): Promise<AiCallError> {
  try {
    await fn();
  } catch (err) {
    assert(err instanceof AiCallError, `expected AiCallError, got ${err}`);
    return err;
  }
  throw new Error("expected a rejection");
}

const Scores = z.object({ band: z.number().min(0).max(9), notes: z.array(z.string()).min(1) }).strict();
// A Tuesday at 07:00 UTC: DeepSeek peak hours (full price).
const PEAK = Date.UTC(2026, 10, 24, 7, 0, 0);

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "network" | "hang";

/** A fake fetch that answers with `replies` in order and records the requests. */
function fake(replies: Reply[], start = PEAK) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = start;
  const deps: Partial<AiDeps> = {
    apiKey: "test-key",
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
    random: () => 0.5,
    fetch: ((url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = replies.shift();
      if (!r) throw new Error("unexpected extra call");
      if (r === "network") return Promise.reject(new TypeError("connection reset"));
      if (r === "hang") {
        return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      }
      const body = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {});
      return Promise.resolve(new Response(body, { status: r.status ?? 200, headers: r.headers }));
    }) as typeof fetch,
  };
  return { deps, calls, sleeps };
}

/** A DeepSeek chat completion. */
const ds = (content: unknown, finish = "stop", usage = { prompt_tokens: 1000, prompt_cache_hit_tokens: 200, prompt_cache_miss_tokens: 800, completion_tokens: 500 }) => ({
  body: { choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }], usage },
});

const DS = { provider: "deepseek" as const, model: "deepseek-flash" };
const opts = { model: DS, system: "You are an IELTS examiner.", parts: [{ text: "Essay…" }], schema: Scores };

// ── Provider choice ─────────────────────────────────────────────────────────────────────────
Deno.test("DeepSeek is the default; models per job and provider", () => {
  assertEquals(currentProvider(), "deepseek"); // no AI_PROVIDER (and no env permission) in tests
  assertEquals(aiModel("scoring"), { provider: "deepseek", model: "deepseek-flash" });
  assertEquals(aiModel("lite"), { provider: "deepseek", model: "deepseek-flash" });
  assertEquals(aiModel("scoring", "gemini"), { provider: "gemini", model: "gemini-3.8-flash" });
  assertEquals(aiModel("lite", "gemini"), { provider: "gemini", model: "gemini-3.5-flash-lite" });
});

// ── DeepSeek request and reply ──────────────────────────────────────────────────────────────
Deno.test("DeepSeek request: chat completions, JSON object mode, schema in the system message, thinking, images as data URLs", async () => {
  const f = fake([ds({ band: 6.5, notes: ["Clear."] })]);
  await generateJson({ ...opts, thinking: "low", maxOutputTokens: 4000, parts: [{ text: "Read this." }, { image: { mimeType: "image/png", data: "iVBO" } }] }, f.deps);
  const { url, init } = f.calls[0];
  assertEquals(url, "https://api.deepseek.com/chat/completions");
  assertEquals((init.headers as Record<string, string>).authorization, "Bearer test-key");
  const body = JSON.parse(String(init.body));
  assertEquals(body.model, "deepseek-flash");
  assertEquals(body.response_format, { type: "json_object" });
  assertEquals([body.thinking, body.reasoning_effort, body.max_tokens, body.stream], [{ type: "enabled" }, "low", 4000, false]);
  assertEquals(body.messages[0].role, "system");
  assert(body.messages[0].content.startsWith("You are an IELTS examiner."), "the system prompt first");
  assert(body.messages[0].content.includes("json"), 'the docs require the word "json"');
  assert(body.messages[0].content.includes('"required":["band","notes"]'), "and the schema");
  assertEquals(body.messages[1], {
    role: "user",
    content: [{ type: "text", text: "Read this." }, { type: "image_url", image_url: { url: "data:image/png;base64,iVBO" } }],
  });
  assert(!("temperature" in body), "no temperature");
});

Deno.test("DeepSeek thinking off; default leaves the provider's choice", () => {
  const off = JSON.parse(String(deepseek.request({ ...opts, thinking: "off" }, {}, "k").init.body));
  assertEquals([off.thinking, off.reasoning_effort], [{ type: "disabled" }, undefined]);
  const dflt = JSON.parse(String(deepseek.request(opts, {}, "k").init.body));
  assertEquals([dflt.thinking, dflt.max_tokens], [undefined, undefined]);
});

Deno.test("DeepSeek success: data, usage with cache hits, peak cost", async () => {
  const f = fake([ds({ band: 6.5, notes: ["Clear."] })]);
  const out = await generateJson(opts, f.deps);
  assertEquals(out.data, { band: 6.5, notes: ["Clear."] });
  assertEquals([out.usage.input_tokens, out.usage.output_tokens, out.usage.model], [1000, 500, "deepseek-flash"]);
  // Peak: 800 miss × $0.30/M + 200 hit × $0.006/M + 500 out × $1.20/M
  assertEquals(Math.round(out.usage.cost_usd * 1e7) / 1e7, 0.0008412);
});

Deno.test("DeepSeek pricing: off-peak is half; weekends and other hours are off-peak", () => {
  const u = { input: 1000, cachedInput: 0, output: 1000 };
  assertEquals(isDeepseekPeak(new Date(PEAK)), true);
  assertEquals(isDeepseekPeak(new Date(Date.UTC(2026, 10, 24, 5, 0))), false); // 05:00 Tue
  assertEquals(isDeepseekPeak(new Date(Date.UTC(2026, 10, 24, 9, 59))), true);
  assertEquals(isDeepseekPeak(new Date(Date.UTC(2026, 10, 28, 7, 0))), false); // Saturday
  const peak = deepseekCost("deepseek-flash", u, new Date(PEAK));
  assertEquals(peak, 0.0015);
  assertEquals(deepseekCost("deepseek-flash", u, new Date(Date.UTC(2026, 10, 28, 7, 0))), peak / 2);
  assertEquals(deepseekCost("unknown", u, new Date(PEAK)), 0);
});

Deno.test("DeepSeek quirks: a blank reply and insufficient_system_resource are retried; length and content_filter aren't", async () => {
  const f = fake([ds("   "), ds("", "insufficient_system_resource"), ds({ band: 7, notes: ["ok"] })]);
  assertEquals((await generateJson(opts, f.deps)).attempts, 3);
  for (const [finish, expected] of [["length", "cut off"], ["content_filter", "content filter"]]) {
    const g = fake([ds('{"band"', finish)]);
    const err = await rejects(() => generateJson(opts, g.deps));
    assert(err.message.includes(expected), err.message);
    assertEquals(g.calls.length, 1);
  }
});

Deno.test("DeepSeek: blank keep-alive lines before the body are fine", async () => {
  const f = fake([{ body: "\n\n\n" + JSON.stringify(ds({ band: 5, notes: ["x"] }).body) }]);
  assertEquals((await generateJson(opts, f.deps)).data.band, 5);
});

Deno.test("DeepSeek HTTP errors: 429/503/504 retried; 400, 401, 402 (balance), 422 not", async () => {
  const f = fake([
    { status: 429, body: { error: { message: "slow down", type: "rate_limit" } }, headers: { "retry-after": "2" } },
    { status: 503 },
    { status: 504 },
    ds({ band: 5, notes: ["ok"] }),
  ]);
  const out = await generateJson({ ...opts, maxAttempts: 4 }, f.deps);
  assertEquals(out.attempts, 4);
  assertEquals(f.sleeps, [2000, 1500, 3000]);
  for (const status of [400, 401, 402, 422]) {
    const g = fake([{ status, body: { error: { message: "nope", type: "invalid_request_error" } } }]);
    const err = await rejects(() => generateJson(opts, g.deps));
    assert(err.message.includes(`HTTP ${status} invalid_request_error: nope`), err.message);
    assertEquals(g.calls.length, 1, `${status}: one call`);
  }
});

// ── The shared core (run through DeepSeek) ──────────────────────────────────────────────────
Deno.test("invalid JSON or a schema mismatch is retried; the billed tokens of bad replies count", async () => {
  const f = fake([ds("not json"), ds({ band: 12, notes: [] }), ds({ band: 6, notes: ["fine"] })]);
  const out = await generateJson(opts, f.deps);
  assertEquals([out.attempts, out.usage.input_tokens, out.usage.output_tokens], [3, 3000, 1500]);
});

Deno.test("gives up after maxAttempts with AiCallError carrying all usage and the failing field", async () => {
  const f = fake([ds({ band: 12, notes: ["x"] }), ds({ band: 12, notes: ["x"] })]);
  const err = await rejects(() => generateJson({ ...opts, maxAttempts: 2 }, f.deps));
  assert(err.message.includes("deepseek deepseek-flash: reply didn't match the schema"), err.message);
  assert(err.message.includes("band"), "says which field");
  assertEquals(err.usage?.input_tokens, 2000);
  assert((err.usage?.cost_usd ?? 0) > 0, "cost of the failed attempts");
});

Deno.test("network errors and timeouts are retried; the last timeout is reported", async () => {
  const f = fake(["network", "hang", ds({ band: 8, notes: ["great"] })]);
  assertEquals((await generateJson({ ...opts, timeoutMs: 20 }, f.deps)).attempts, 3);
  const g = fake(["hang"]);
  const err = await rejects(() => generateJson({ ...opts, timeoutMs: 20, maxAttempts: 1 }, g.deps));
  assert(err.message.includes("timed out after 20 ms"), err.message);
});

Deno.test("the deadline stops retries", async () => {
  const f = fake([{ status: 503 }, { status: 503 }, ds({ band: 6, notes: ["x"] })]);
  const err = await rejects(() => generateJson({ ...opts, deadlineMs: 500 }, f.deps));
  assert(err.message.includes("deadline reached") && err.message.includes("HTTP 503"), err.message);
  assertEquals(f.calls.length, 1);
});

Deno.test("a cancelled request stops without retrying", async () => {
  const controller = new AbortController();
  const f = fake(["hang", ds({ band: 6, notes: ["x"] })]);
  const pending = generateJson({ ...opts, signal: controller.signal }, f.deps);
  setTimeout(() => controller.abort(), 10);
  const err = await rejects(() => pending);
  assert(err.message.includes("cancelled"), err.message);
  assertEquals(f.calls.length, 1);
});

Deno.test("no key: a clear configuration error before any call", async () => {
  try {
    await generateJson(opts, { fetch: () => Promise.reject(new Error("must not call")) });
    throw new Error("expected an error");
  } catch (err) {
    assert(err instanceof Error && !(err instanceof AiCallError), "a plain configuration error");
    assert(err.message.includes("DEEPSEEK_API_KEY"), err.message);
  }
});

// ── Gemini (the alternative) ────────────────────────────────────────────────────────────────
const GM = { provider: "gemini" as const, model: "gemini-3.8-flash" };
const gm = (payload: unknown, finish = "STOP") => ({
  body: {
    candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }, finishReason: finish }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 300, thoughtsTokenCount: 200 },
  },
});

Deno.test("Gemini request: generateContent, JSON mode with responseJsonSchema, thinking level, inlineData", async () => {
  const f = fake([gm({ band: 6.5, notes: ["Clear."] })]);
  const out = await generateJson({ ...opts, model: GM, thinking: "low", parts: [{ text: "x" }, { image: { mimeType: "image/jpeg", data: "AAAA" } }] }, f.deps);
  const { url, init } = f.calls[0];
  assertEquals(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assertEquals((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  const body = JSON.parse(String(init.body));
  assertEquals(body.systemInstruction, { parts: [{ text: "You are an IELTS examiner." }] });
  assertEquals(body.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
  assertEquals(body.generationConfig.responseMimeType, "application/json");
  assertEquals(body.generationConfig.responseJsonSchema.required, ["band", "notes"]);
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: "LOW" });
  // Thought parts skipped; thinking billed as output: 1000 × $1.50/M + 500 × $7.50/M.
  assertEquals([out.usage.output_tokens, out.usage.cost_usd], [500, 0.00525]);
});

Deno.test("Gemini: blocked prompt, SAFETY, MAX_TOKENS and 504 aren't retried", async () => {
  const cases: [Reply, string][] = [
    [{ body: { promptFeedback: { blockReason: "SAFETY" } } }, "prompt blocked (SAFETY)"],
    [{ body: { candidates: [{ finishReason: "SAFETY" }] } }, "finishReason SAFETY"],
    [gm('{"band"', "MAX_TOKENS"), "MAX_TOKENS"],
    [{ status: 504 }, "HTTP 504"],
  ];
  for (const [reply, expected] of cases) {
    const f = fake([reply]);
    const err = await rejects(() => generateJson({ ...opts, model: GM }, f.deps));
    assert(err.message.includes(expected), `${err.message} should include ${expected}`);
    assertEquals(f.calls.length, 1, expected);
  }
});

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────
Deno.test("helpers: JSON Schema, base64, image types, Gemini cost", () => {
  assertEquals(toJsonSchema(z.enum(["a", "b"])), { type: "string", enum: ["a", "b"] });
  assert(!("$schema" in toJsonSchema(Scores)), "no $schema key");
  assertEquals(bytesToBase64(new TextEncoder().encode("hello")), "aGVsbG8=");
  assertEquals(bytesToBase64(new Uint8Array(100_000)).length, 133_336); // large input, no stack overflow
  assert(!deepseek.imageTypes.has("image/heic"), "DeepSeek doesn't read HEIC");
  assert(gemini.imageTypes.has("image/heic"), "Gemini does");
  assertEquals(Math.round(geminiCost("gemini-3.5-flash-lite", { input: 3200, cachedInput: 0, output: 800 }) * 1e5) / 1e5, 0.00296);
});
