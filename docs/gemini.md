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

## Writing scoring and OCR (M6-B2..B5)

| Function | Model | Credits | Notes |
|---|---|---|---|
| `score-writing` | `gemini-3.8-flash` | 4 (`writing_t1` / `writing_t2`) | Saves a `writing_submissions` row; Free gets the summary only |
| `ocr-writing` | `gemini-3.5-flash-lite` | 1 (`ocr`, Gold/Platinum) | Reads 1–2 photos from `writing-photos`; saves nothing |

- **Prompts** live in versioned files in `supabase/functions/_shared/prompts/` (`writing-t1-academic.v1.ts`,
  `writing-t1-general.v1.ts`, `writing-t2.v1.ts`, the shared `writing-rubric.v1.ts`, `ocr-handwriting.v1.ts`).
  `prompts/writing.ts` picks the versions in use. Never edit a released version: copy it to `v2`, run the eval,
  then switch. Each submission stores its `prompt_version`.
- **Checks before spending credits:** the task, the photos' folder, the plan, the Task 1 chart and the key. Anything
  that fails after spending (the AI, saving the submission) refunds the credits, and `ai_usage` still records the tokens.
- **The band** is always recomputed from the four criteria (average, rounded down to a half band), never taken from
  the model. Corrections that don't quote the answer exactly are dropped.

### Running the functions locally with the key

```sh
supabase functions serve --env-file supabase/functions/.env
```

Restart it after adding a function folder: the runtime only serves the functions that existed when it started.

The API tests in `apps/web/e2e/writing-ai.spec.ts` always check the error paths. The real-AI test (about US$0.06) runs
only with `E2E_GEMINI=1`:

```sh
cd apps/web
E2E_GEMINI=1 pnpm exec playwright test writing-ai --project=desktop
```

### Prompt evaluation (M6-B5)

20 answers with target bands in `supabase/functions/_eval/writing_essays.ts`: 10 Task 2, 5 General Task 1 and
5 Academic Task 1, bands 4 to 8.5. **These were written for the set and are not examiner-marked**, so they are an
informed label, not ground truth. Put examiner-marked scripts in the gitignored `_eval/writing_essays.local.json`
(same fields) for a stronger check. From `supabase/functions`, with Deno 2 (about US$0.60 for the set):

```sh
deno run --frozen --env-file=.env --allow-env=GEMINI_API_KEY \
  --allow-net=generativelanguage.googleapis.com --allow-read=_eval --allow-write=_eval/results \
  _eval/writing_eval.ts            # --only t2 | --limit 5 | --concurrency 2 | --dry-run
```

With Deno 1.x installed locally, run the same command in Docker (Deno reads `.env` itself):

```sh
docker run --rm -v "$PWD:/app" -w /app denoland/deno:latest deno run --frozen --env-file=.env --allow-env=GEMINI_API_KEY --allow-net=generativelanguage.googleapis.com --allow-read=_eval --allow-write=_eval/results _eval/writing_eval.ts
```

It prints each answer's target and AI band, the share within ±0.5 (target 75%), the mean error, the bias and the
cost. It writes a JSON report to `_eval/results/` (gitignored) and exits 1 when under the target.
