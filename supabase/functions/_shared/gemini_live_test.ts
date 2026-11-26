// One real Gemini call (M6-B1), to check the model ids, JSON mode and usage fields against the
// live API. Skipped unless it's given a key and network access, so CI (no permissions, no key)
// never calls Gemini. Costs a fraction of a cent. Run from supabase/functions (Deno 2):
//
//   GEMINI_API_KEY=… deno test --frozen --allow-env=GEMINI_API_KEY --allow-net=generativelanguage.googleapis.com _shared/gemini_live_test.ts
//
// Use a development key with test data only (plan §2.6: never real user data on the free tier).
import { z } from "./deps.ts";
import { GEMINI_MODELS, generateJson } from "./gemini.ts";

function key(): string | undefined {
  const env = Deno.permissions.querySync({ name: "env", variable: "GEMINI_API_KEY" }).state === "granted";
  const net = Deno.permissions.querySync({ name: "net", host: "generativelanguage.googleapis.com" }).state === "granted";
  return env && net ? Deno.env.get("GEMINI_API_KEY") || undefined : undefined;
}

const Verdict = z
  .object({
    band: z.number().min(0).max(9),
    corrections: z.array(z.object({ original: z.string(), suggestion: z.string() }).strict()).min(1),
  })
  .strict();

for (const model of [GEMINI_MODELS.scoring, GEMINI_MODELS.lite]) {
  Deno.test({
    name: `live: ${model} returns schema-valid JSON with usage`,
    ignore: !key(),
    fn: async () => {
      const out = await generateJson({
        model,
        system: "You are an IELTS examiner. Reply with JSON only.",
        parts: [{ text: 'Estimate a band and list the mistakes in: "Nowadays alot of peoples works from home."' }],
        schema: Verdict,
        thinkingLevel: "low",
        maxOutputTokens: 2000,
        timeoutMs: 45_000,
      });
      if (out.usage.input_tokens <= 0 || out.usage.output_tokens <= 0) throw new Error("usage missing");
      console.log(model, JSON.stringify({ attempts: out.attempts, usage: out.usage, corrections: out.data.corrections.length }));
    },
  });
}
