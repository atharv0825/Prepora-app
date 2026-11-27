// One real call per provider and job, to check model ids, JSON mode, images and usage fields against
// the live APIs. Each provider's test runs only when it's given that provider's key and network
// access, so CI (no permissions, no keys) never calls an AI API. Costs a fraction of a cent.
// Run from supabase/functions (Deno 2), e.g. for DeepSeek:
//
//   deno test --frozen --env-file=.env --allow-env --allow-net=api.deepseek.com _shared/ai_live_test.ts
//
// (add generativelanguage.googleapis.com to --allow-net for Gemini). Use test data only.
import { z } from "./deps.ts";
import { ADAPTERS, aiModel, type AiProvider, generateJson } from "./ai.ts";

const HOSTS: Record<AiProvider, string> = { deepseek: "api.deepseek.com", gemini: "generativelanguage.googleapis.com" };

function ready(provider: AiProvider): boolean {
  const keyEnv = ADAPTERS[provider].keyEnv;
  const env = Deno.permissions.querySync({ name: "env", variable: keyEnv }).state === "granted";
  const net = Deno.permissions.querySync({ name: "net", host: HOSTS[provider] }).state === "granted";
  return env && net && Boolean(Deno.env.get(keyEnv));
}

const Verdict = z
  .object({
    band: z.number().min(0).max(9),
    corrections: z.array(z.object({ original: z.string(), suggestion: z.string() }).strict()).min(1),
  })
  .strict();

// A 1×1 white PNG: checks image input is accepted (the reply's content doesn't matter).
const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

for (const provider of ["deepseek", "gemini"] as const) {
  for (const job of ["scoring", "lite"] as const) {
    const model = aiModel(job, provider);
    Deno.test({
      name: `live: ${provider} ${model.model} (${job}) returns schema-valid JSON with usage, image included`,
      ignore: !ready(provider),
      fn: async () => {
        const out = await generateJson({
          model,
          system: "You are an IELTS examiner. Reply with JSON only.",
          parts: [
            { text: 'Estimate a band and list the mistakes in: "Nowadays alot of peoples works from home." (Ignore the image.)' },
            { image: { mimeType: "image/png", data: PIXEL } },
          ],
          schema: Verdict,
          thinking: "low",
          maxOutputTokens: 4000,
          timeoutMs: 60_000,
        });
        if (out.usage.input_tokens <= 0 || out.usage.output_tokens <= 0) throw new Error("usage missing");
        console.log(provider, model.model, JSON.stringify({ attempts: out.attempts, usage: out.usage, corrections: out.data.corrections.length }));
      },
    });
  }
}
