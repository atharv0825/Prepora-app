// The AI stub (M6-I1) driven through the real client and DeepSeek adapter, as score-writing and
// ocr-writing use them in CI: the replies validate against the production schemas. No network.
// Run (Deno 2, from supabase/functions): deno test --frozen _shared/
import { AiCallError } from "./credits.ts";
import { aiModel, generateJson } from "./ai.ts";
import { handleStub, STUB_OCR_PAGE } from "./ai_stub.ts";
import { buildOcrRequest, buildScoringRequest, OCR_SETTINGS, SCORING_SETTINGS } from "./prompts/writing.ts";
import { OcrModelOutput, ScoredWriting } from "./writing_schemas.ts";
import { keepFoundCorrections, writingTaskBand } from "./writing.ts";

function assert(cond: unknown, msg = "assertion failed"): asserts cond {
  if (!cond) throw new Error(msg);
}
function assertEquals(actual: unknown, expected: unknown, msg = "") {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`);
}

const stub = (enabled = true) => ({
  apiKey: "e2e-stub",
  fetch: ((url: string, init: RequestInit) => handleStub(new Request(url, init), enabled)) as typeof fetch,
  sleep: () => Promise.resolve(),
});
const model = aiModel("scoring", "deepseek");
const ESSAY = "Nowadays alot of companies let staff work from home, and many peoples like it. ".repeat(20).trim();

Deno.test("stub scoring: valid ScoredWriting, corrections quote the answer", async () => {
  const req = buildScoringRequest({ taskNo: 2, testType: null, prompt: "Discuss remote work." }, ESSAY);
  const out = await generateJson({ model, system: req.system, parts: req.parts, schema: ScoredWriting, ...SCORING_SETTINGS }, stub());
  assertEquals(out.data.scores, { ta: 6.5, cc: 6, lr: 6, gra: 6 });
  assertEquals(writingTaskBand(out.data.scores), 6);
  assertEquals(out.data.corrections.map((c) => c.original), ["alot", "peoples"]);
  assertEquals(keepFoundCorrections(ESSAY, out.data.corrections).length, 2);
  assert(out.data.summary.includes("(Stub AI)"));
  assert(out.usage.input_tokens > 1000 && out.usage.output_tokens > 0 && out.usage.cost_usd > 0, JSON.stringify(out.usage));
});

Deno.test("stub scoring: under length lowers Task Response", async () => {
  const req = buildScoringRequest({ taskNo: 1, testType: "general", prompt: "Write a letter." }, "Dear Sir, the noise is bad.");
  const out = await generateJson({ model, system: req.system, parts: req.parts, schema: ScoredWriting }, stub());
  assertEquals(out.data.scores.ta, 5);
  assert(out.data.summary.includes("under the 150-word minimum"), out.data.summary);
});

Deno.test("stub OCR: one page per photo, valid OcrModelOutput", async () => {
  const photos = [{ mimeType: "image/jpeg", data: "AAAA" }, { mimeType: "image/jpeg", data: "BBBB" }];
  const req = buildOcrRequest(photos);
  const out = await generateJson({ model: aiModel("lite", "deepseek"), system: req.system, parts: req.parts, schema: OcrModelOutput, ...OCR_SETTINGS }, stub());
  assertEquals(out.data.pages, [{ text: STUB_OCR_PAGE, legibility: "partial" }, { text: STUB_OCR_PAGE, legibility: "partial" }]);
});

Deno.test("stub hooks: STUB_FAIL and STUB_BAD_JSON fail the call (after retries), with usage", async () => {
  for (const marker of ["STUB_FAIL", "STUB_BAD_JSON"]) {
    const req = buildScoringRequest({ taskNo: 2, testType: null, prompt: "Essay" }, `My essay. ${marker}`);
    try {
      await generateJson({ model, system: req.system, parts: req.parts, schema: ScoredWriting, maxAttempts: 2 }, stub());
      throw new Error("expected a failure");
    } catch (err) {
      assert(err instanceof AiCallError, String(err));
    }
  }
});

Deno.test("stub is off unless enabled", async () => {
  const res = await handleStub(new Request("http://x/ai-stub", { method: "POST", body: "{}" }), false);
  assertEquals(res.status, 404);
});
