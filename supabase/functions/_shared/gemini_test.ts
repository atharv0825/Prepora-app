// Unit tests for the Gemini client (M6-B1), with a fake fetch: no network, no key.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { z } from "./deps.ts";
import { AiCallError } from "./credits.ts";
import { buildRequestBody, GEMINI_MODELS, geminiCostUsd, generateJson, type GeminiDeps, toGeminiJsonSchema } from "./gemini.ts";

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

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "network" | "hang";

/** A fake fetch that answers with `replies` in order and records the requests. */
function fake(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const deps: Partial<GeminiDeps> = {
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
  return { deps, calls, sleeps, advance: (ms: number) => (clock += ms) };
}

const ok = (payload: unknown, usage = { promptTokenCount: 1000, candidatesTokenCount: 300, thoughtsTokenCount: 200 }) => ({
  body: {
    candidates: [{ content: { parts: [{ text: typeof payload === "string" ? payload : JSON.stringify(payload) }] }, finishReason: "STOP" }],
    usageMetadata: usage,
  },
});

const opts = { model: GEMINI_MODELS.scoring, system: "You are an IELTS examiner.", parts: [{ text: "Essay…" }], schema: Scores };

Deno.test("request: JSON mode with the schema, system instruction, key header, no temperature", async () => {
  const f = fake([ok({ band: 6.5, notes: ["Clear."] })]);
  await generateJson({ ...opts, thinkingLevel: "low", maxOutputTokens: 4000 }, f.deps);
  const { url, init } = f.calls[0];
  assertEquals(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assertEquals((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
  const body = JSON.parse(String(init.body));
  assertEquals(body.systemInstruction, { parts: [{ text: "You are an IELTS examiner." }] });
  assertEquals(body.contents, [{ role: "user", parts: [{ text: "Essay…" }] }]);
  assertEquals(body.generationConfig.responseMimeType, "application/json");
  assertEquals(body.generationConfig.thinkingConfig, { thinkingLevel: "LOW" });
  assertEquals(body.generationConfig.maxOutputTokens, 4000);
  assertEquals(body.generationConfig.responseJsonSchema.required, ["band", "notes"]);
  assertEquals(body.generationConfig.responseJsonSchema.additionalProperties, false);
  assert(!("$schema" in body.generationConfig.responseJsonSchema), "no $schema key");
  assert(!("temperature" in body.generationConfig), "no temperature");
});

Deno.test("success: validated data, usage with thinking billed as output, cost", async () => {
  const f = fake([ok({ band: 6.5, notes: ["Clear."] })]);
  const out = await generateJson(opts, f.deps);
  assertEquals(out.data, { band: 6.5, notes: ["Clear."] });
  assertEquals(out.attempts, 1);
  assertEquals(out.usage.input_tokens, 1000);
  assertEquals(out.usage.output_tokens, 500);
  // 1000 × $1.50/M + 500 × $7.50/M
  assertEquals(out.usage.cost_usd, 0.00525);
  assertEquals(out.usage.model, "gemini-3.8-flash");
});

Deno.test("thought parts are skipped; text parts are joined", async () => {
  const f = fake([{
    body: {
      candidates: [{
        content: { parts: [{ text: "thinking…", thought: true }, { text: '{"band": 7,' }, { text: ' "notes": ["x"]}' }] },
        finishReason: "STOP",
      }],
    },
  }]);
  assertEquals((await generateJson(opts, f.deps)).data, { band: 7, notes: ["x"] });
});

Deno.test("429 and 503 are retried with backoff (Retry-After honoured), usage summed", async () => {
  const f = fake([
    { status: 429, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "slow down" } }, headers: { "retry-after": "2" } },
    { status: 503, body: { error: { status: "UNAVAILABLE" } } },
    ok({ band: 5, notes: ["ok"] }),
  ]);
  const out = await generateJson(opts, f.deps);
  assertEquals(out.attempts, 3);
  assertEquals(f.sleeps, [2000, 1500]); // Retry-After 2 s; then 750 × 2 × (0.5 + 0.5)
});

Deno.test("invalid JSON or a schema mismatch is retried; the billed tokens of the bad reply count", async () => {
  const f = fake([ok("not json"), ok({ band: 12, notes: [] }), ok({ band: 6, notes: ["fine"] })]);
  const out = await generateJson(opts, f.deps);
  assertEquals(out.attempts, 3);
  assertEquals(out.usage.input_tokens, 3000);
  assertEquals(out.usage.output_tokens, 1500);
});

Deno.test("gives up after maxAttempts with AiCallError carrying all usage", async () => {
  const f = fake([ok({ band: 12, notes: ["x"] }), ok({ band: 12, notes: ["x"] })]);
  const err = await rejects(() => generateJson({ ...opts, maxAttempts: 2 }, f.deps));
  assert(err.message.includes("didn't match the schema"), err.message);
  assert(err.message.includes("band"), "says which field");
  assertEquals(err.usage?.input_tokens, 2000);
  assert((err.usage?.cost_usd ?? 0) > 0, "cost of the failed attempts");
});

Deno.test("no retry: 400 (bad request), 403 (key), blocked prompt, SAFETY, MAX_TOKENS", async () => {
  const cases: [Reply, string][] = [
    [{ status: 400, body: { error: { status: "INVALID_ARGUMENT", message: "bad schema" } } }, "HTTP 400 INVALID_ARGUMENT: bad schema"],
    [{ status: 403, body: { error: { status: "PERMISSION_DENIED" } } }, "HTTP 403"],
    [{ body: { promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 50 } } }, "prompt blocked (SAFETY)"],
    [{ body: { candidates: [{ finishReason: "SAFETY" }] } }, "finishReason SAFETY"],
    [{ body: { candidates: [{ content: { parts: [{ text: '{"band"' }] }, finishReason: "MAX_TOKENS" }] } }, "MAX_TOKENS"],
  ];
  for (const [reply, expected] of cases) {
    const f = fake([reply]);
    const err = await rejects(() => generateJson(opts, f.deps));
    assert(err.message.includes(expected), `${err.message} should include ${expected}`);
    assertEquals(f.calls.length, 1, `${expected}: one call only`);
  }
});

Deno.test("504 isn't retried (a second slow call doubles the bill)", async () => {
  const f = fake([{ status: 504 }]);
  await rejects(() => generateJson(opts, f.deps));
  assertEquals(f.calls.length, 1);
});

Deno.test("network errors and timeouts are retried", async () => {
  const f = fake(["network", "hang", ok({ band: 8, notes: ["great"] })]);
  const out = await generateJson({ ...opts, timeoutMs: 20 }, f.deps);
  assertEquals(out.attempts, 3);
});

Deno.test("a timeout on the last attempt fails with the reason", async () => {
  const f = fake(["hang"]);
  const err = await rejects(() => generateJson({ ...opts, timeoutMs: 20, maxAttempts: 1 }, f.deps));
  assert(err.message.includes("timed out after 20 ms"), err.message);
});

Deno.test("the deadline stops retries", async () => {
  const f = fake([{ status: 503 }, { status: 503 }, ok({ band: 6, notes: ["x"] })]);
  // Backoff 750 ms won't fit in a 500 ms deadline: give up after one call.
  const err = await rejects(() => generateJson({ ...opts, deadlineMs: 500 }, f.deps));
  assert(err.message.includes("deadline reached"), err.message);
  assert(err.message.includes("HTTP 503"), "keeps the last error");
  assertEquals(f.calls.length, 1);
});

Deno.test("a cancelled request stops without retrying", async () => {
  const controller = new AbortController();
  const f = fake(["hang", ok({ band: 6, notes: ["x"] })]);
  const pending = generateJson({ ...opts, signal: controller.signal }, f.deps);
  setTimeout(() => controller.abort(), 10);
  const err = await rejects(() => pending);
  assert(err.message.includes("cancelled"), err.message);
  assertEquals(f.calls.length, 1);
});

Deno.test("images go inline; prices and schema helpers", () => {
  const body = buildRequestBody({ model: GEMINI_MODELS.lite, parts: [{ text: "Read this." }, { inlineData: { mimeType: "image/jpeg", data: "AAAA" } }], schema: Scores });
  assertEquals((body.contents as { parts: unknown[] }[])[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
  assert(!("systemInstruction" in body), "no empty system instruction");
  assert(!("thinkingConfig" in (body.generationConfig as object)), "model default thinking");
  // Flash-Lite: 3,200 in × $0.30/M + 800 out × $2.50/M ≈ the plan's $0.003 per OCR.
  assertEquals(Math.round(geminiCostUsd(GEMINI_MODELS.lite, 3200, 800) * 1e5) / 1e5, 0.00296);
  assertEquals(geminiCostUsd("unknown-model", 1000, 1000), 0);
  assertEquals(toGeminiJsonSchema(z.enum(["a", "b"])), { type: "string", enum: ["a", "b"] });
});

Deno.test("no key: a clear configuration error before any call", async () => {
  const had = Deno.permissions.querySync({ name: "env", variable: "GEMINI_API_KEY" }).state === "granted" && Deno.env.get("GEMINI_API_KEY");
  if (had) return; // a developer running with their key: nothing to check
  try {
    await generateJson(opts, { fetch: () => Promise.reject(new Error("must not call")) });
    throw new Error("expected an error");
  } catch (err) {
    assert(err instanceof Error && !(err instanceof AiCallError), "a plain configuration error");
    assert(/GEMINI_API_KEY|env/i.test(err.message), err.message);
  }
});
