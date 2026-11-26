# Gemini for AI scoring (M6-B1)

Writing (M6) and Speaking (M7) feedback come from Google's Gemini API, called only from Edge
Functions through `supabase/functions/_shared/gemini.ts`. The key is a Supabase secret and never
reaches a browser.

| Job | Model | Price used for `ai_usage.cost_usd` (per 1M tokens) |
|---|---|---|
| Scoring, generation | `gemini-3.8-flash` | $1.50 in / $7.50 out |
| OCR, examiner turns | `gemini-3.5-flash-lite` | $0.30 in / $2.50 out |

Thinking tokens are billed as output. The prices come from the plan's cost table (§2.6): check
them against Google's pricing page and update `GEMINI_PRICES` in `gemini.ts` when they change.
Model ids are in `GEMINI_MODELS`; change `credit_costs.model` with them.

## One-time setup (per environment: staging, then production)

Done by an account owner. No key goes in the repo.

1. **Use a paid-tier key for anything with real users.** On the free tier Google may use prompts
   to improve its products, which conflicts with the privacy policy (plan §2.6). A free-tier key
   is fine for local development with test data.
   - Google AI Studio → API keys → create a key in a Google Cloud project with billing enabled.
   - In Google Cloud, restrict the key to the "Generative Language API" and set a budget alert.
2. **Set the secret** (from the repo root, linked to the environment's project):
   ```sh
   supabase secrets set GEMINI_API_KEY=<key>
   ```
3. **Local Edge Functions:** put `GEMINI_API_KEY=<key>` in the env file you pass to
   `supabase functions serve --env-file <file>` (gitignored, never committed).

Without the secret, AI functions fail with a configuration error before any call (and the
student's credits are refunded by `withCredits`).

## Checking the live API

`_shared/gemini_live_test.ts` makes one real call to each model (a fraction of a cent) and checks
the reply is schema-valid JSON with token usage. It's skipped in CI. From `supabase/functions`,
with Deno 2:

```sh
GEMINI_API_KEY=<dev key> deno test --frozen --allow-env=GEMINI_API_KEY \
  --allow-net=generativelanguage.googleapis.com _shared/gemini_live_test.ts
```

## How calls behave

- JSON mode: `responseMimeType: application/json` plus `responseJsonSchema` made from the Zod
  schema; the reply is validated with the same schema (Gemini ignores some constraints).
- Each attempt has a timeout (60 s by default) inside an overall deadline (120 s); up to 3 attempts.
- Retried: 408, 429, 500, 502, 503, network errors, timeouts, and replies that aren't valid JSON or
  fail the schema. Not retried: 400/401/403/404, 504, blocked prompts, safety stops, and replies
  cut off at the token limit.
- Failures throw `AiCallError` with the tokens of every attempt, so `ai_usage` records the real cost.
- No `temperature`/`topP`/`topK` (newer Gemini models ignore them and will reject them).
- Prompts and replies are never logged: they contain students' writing.
