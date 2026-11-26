// Unit tests for the Groq Whisper client (M7-B1), with a fake fetch: no network, no key.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { AiCallError } from "./credits.ts";
import { FILLER_PROMPT, sttCost, transcribe, type SttDeps } from "./stt.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | "network" | "hang";

function fake(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let clock = 0;
  const deps: Partial<SttDeps> = {
    apiKey: "gsk-test",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
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
      if (r === "network") return Promise.reject(new TypeError("reset"));
      if (r === "hang") return new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      return Promise.resolve(new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: r.headers }));
    }) as typeof fetch,
  };
  return { deps, calls, sleeps };
}

const VERBOSE = {
  text: " Um, I like the beach. ",
  language: "english",
  duration: 7.4,
  segments: [{ id: 0, seek: 0, start: 0, end: 7.2, text: " Um, I like the beach.", tokens: [1], temperature: 0, avg_logprob: -0.1, compression_ratio: 1.2, no_speech_prob: 0.01 }],
  words: [
    { word: " Um,", start: 0.2, end: 0.5 },
    { word: " I", start: 1.9, end: 2.0 },
    { word: " like", start: 2.0, end: 2.3 },
    { word: " the", start: 2.3, end: 2.4 },
    { word: " beach.", start: 2.4, end: 2.9 },
  ],
  x_groq: { id: "req_1" },
};
const audio = () => new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

Deno.test("request: multipart with the model, file, verbose_json, word + segment timings, English, the filler prompt", async () => {
  const f = fake([{ body: VERBOSE }]);
  await transcribe({ audio: audio(), mimeType: "audio/webm;codecs=opus" }, f.deps);
  const { url, init } = f.calls[0]!;
  assertEquals(url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assertEquals((init.headers as Record<string, string>).authorization, "Bearer gsk-test");
  const form = init.body as FormData;
  assertEquals(form.get("model"), "whisper-large-v3-turbo");
  assertEquals(form.get("response_format"), "verbose_json");
  assertEquals(form.getAll("timestamp_granularities[]"), ["word", "segment"]);
  assertEquals([form.get("language"), form.get("temperature"), form.get("prompt")], ["en", "0", FILLER_PROMPT]);
  assertEquals((form.get("file") as File).name, "answer.webm");
});

Deno.test("Safari's MP4/AAC is sent as .m4a", async () => {
  const f = fake([{ body: VERBOSE }]);
  await transcribe({ audio: audio(), mimeType: "audio/mp4" }, f.deps);
  assertEquals(((f.calls[0]!.init.body as FormData).get("file") as File).name, "answer.m4a");
});

Deno.test("reply: trimmed text and words, segments with confidence, duration, cost (10 s minimum)", async () => {
  const f = fake([{ body: VERBOSE }]);
  const t = await transcribe({ audio: audio(), mimeType: "audio/webm" }, f.deps);
  assertEquals(t.text, "Um, I like the beach.");
  assertEquals(t.words.map((w) => w.word), ["Um,", "I", "like", "the", "beach."]);
  assertEquals(t.segments, [{ start: 0, end: 7.2, text: "Um, I like the beach.", avg_logprob: -0.1, no_speech_prob: 0.01 }]);
  assertEquals([t.duration_sec, t.language], [7.4, "english"]);
  // 7.4 s is billed as 10 s: 10 / 3600 × $0.04.
  assertEquals(t.usage, { model: "whisper-large-v3-turbo", audio_seconds: 7.4, cost_usd: sttCost("whisper-large-v3-turbo", 7.4) });
  assertEquals(Math.round(t.usage.cost_usd * 1e9), 111111);
  assertEquals(Math.round(sttCost("whisper-large-v3-turbo", 120) * 1e7), 13333); // a 2-minute answer ≈ $0.0013
  assertEquals(sttCost("whisper-large-v3-turbo", 0), 0);
});

Deno.test("a reply without words or segments still gives the text (no timings)", async () => {
  const f = fake([{ body: { text: "Hello there", x_groq: { id: "r" } } }]);
  const t = await transcribe({ audio: audio(), mimeType: "audio/ogg" }, f.deps);
  assertEquals([t.text, t.words, t.segments, t.duration_sec], ["Hello there", [], [], 0]);
});

Deno.test("retries 429 (Retry-After), 503, 498, network errors and timeouts; then succeeds", async () => {
  const f = fake([
    { status: 429, body: { error: { message: "slow", type: "rate_limit" } }, headers: { "retry-after": "3" } },
    { status: 503 },
    "network",
    { body: VERBOSE },
  ]);
  const t = await transcribe({ audio: audio(), mimeType: "audio/webm", maxAttempts: 4 }, f.deps);
  assertEquals(t.text, "Um, I like the beach.");
  assertEquals(f.sleeps, [3000, 1500, 3000]);
  const g = fake(["hang", { status: 498 }, { body: VERBOSE }]);
  await transcribe({ audio: audio(), mimeType: "audio/webm", timeoutMs: 20 }, g.deps);
  assertEquals(g.calls.length, 3);
});

Deno.test("no retry for 400, 401, 413, 422; failures carry zero cost", async () => {
  for (const status of [400, 401, 413, 422]) {
    const f = fake([{ status, body: { error: { message: "bad", type: "invalid_request_error" } } }]);
    try {
      await transcribe({ audio: audio(), mimeType: "audio/webm" }, f.deps);
      throw new Error("expected a failure");
    } catch (err) {
      assert(err instanceof AiCallError, String(err));
      assert(err.message.includes(`HTTP ${status} invalid_request_error: bad`), err.message);
      assertEquals(err.usage?.cost_usd, 0);
    }
    assertEquals(f.calls.length, 1, `${status}: one call`);
  }
});

Deno.test("an unreadable reply is retried; the deadline stops retries", async () => {
  const f = fake([{ body: "not json" }, { body: { nope: true } }, { body: VERBOSE }]);
  assertEquals((await transcribe({ audio: audio(), mimeType: "audio/webm" }, f.deps)).text, "Um, I like the beach.");
  const g = fake([{ status: 503 }, { status: 503 }]);
  try {
    await transcribe({ audio: audio(), mimeType: "audio/webm", deadlineMs: 500 }, g.deps);
    throw new Error("expected a failure");
  } catch (err) {
    assert(err instanceof AiCallError && err.message.includes("deadline reached"), String(err));
  }
  assertEquals(g.calls.length, 1);
});

Deno.test("unsupported audio types and a missing key fail before any call", async () => {
  let calls = 0;
  const fetch = (() => {
    calls++;
    return Promise.reject(new Error("must not call"));
  }) as typeof globalThis.fetch;
  for (const run of [
    () => transcribe({ audio: audio(), mimeType: "video/quicktime" }, { apiKey: "k", fetch }),
    () => transcribe({ audio: audio(), mimeType: "audio/webm" }, { fetch }),
  ]) {
    try {
      await run();
      throw new Error("expected an error");
    } catch (err) {
      assert(err instanceof Error && !(err instanceof AiCallError), String(err));
    }
  }
  assertEquals(calls, 0);
});
