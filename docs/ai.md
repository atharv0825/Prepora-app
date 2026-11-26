# AI for scoring and OCR (M6)

Writing feedback and handwriting OCR (and later Speaking) come from an AI model called only from Edge
Functions through `supabase/functions/_shared/ai.ts`. API keys are Supabase secrets and never reach
a browser.

**DeepSeek is the provider first.** Gemini (built in M6-B1) stays available: set the `AI_PROVIDER`
secret to `gemini` to switch, with no code change.

| Provider | Scoring model | OCR model | Key secret | Price (US$ per 1M tokens) |
|---|---|---|---|---|
| **DeepSeek** (default) | `deepseek-flash` | `deepseek-flash` | `DEEPSEEK_API_KEY` | $0.30 in ($0.006 cached) / $1.20 out at peak; **half off-peak** |
| Gemini | `gemini-3.8-flash` | `gemini-3.5-flash-lite` | `GEMINI_API_KEY` | Flash $1.50 / $7.50; Flash-Lite $0.30 / $2.50 |

- DeepSeek peak hours are Mon–Fri 01:00–04:00 and 06:00–10:00 UTC (Chinese public holidays are
  off-peak; the code ignores holidays, so it slightly overestimates those days).
- Thinking tokens are billed as output on both. `ai_usage.cost_usd` is computed from
  `DEEPSEEK_PRICES` (`ai_deepseek.ts`) and `GEMINI_PRICES` (`ai_gemini.ts`): update them when the
  pricing pages change. Model ids are in `AI_MODELS` (`ai.ts`); keep `credit_costs.model` in step.
- Rough cost per action on DeepSeek at peak: Writing Task 2 ≈ $0.006, Task 1 ≈ $0.005, OCR ≈ $0.002
  (migration `20261126130000_writing_ai_deepseek.sql`). The real numbers are in `ai_usage`.

### Differences that matter

| | DeepSeek | Gemini |
|---|---|---|
| JSON | "JSON object" mode only, no schema enforcement: the JSON Schema is put in the system message | `responseJsonSchema` |
| Images | JPEG, PNG, WebP, GIF (**no HEIC**) | also HEIC/HEIF |
| Inline size | 48 MiB per request | ~20 MB |
| Quirk | can return blank content with `finish_reason: stop` (retried) | — |

Either way the reply is validated with the Zod schema and retried if it doesn't match.

### Privacy: decide before launch

DeepSeek's API docs don't say where API data is stored or how long it's kept. DeepSeek is based in
China. Before real users' writing is sent to it, check DeepSeek's privacy policy and terms, and say
in Prepora's privacy policy which provider processes answers and where. For Gemini, use a paid-tier
key: on the free tier Google may use prompts to improve its products.

## One-time setup (per environment: staging, then production)

Done by an account owner. No key goes in the repo.

1. **Create a DeepSeek API key** (platform.deepseek.com → API keys) and add balance: requests fail
   with HTTP 402 when the balance runs out.
2. **Set the secret** (from the repo root, linked to the environment's project):
   ```sh
   supabase secrets set DEEPSEEK_API_KEY=<key>
   ```
   To use Gemini instead: `supabase secrets set GEMINI_API_KEY=<key> AI_PROVIDER=gemini`.
3. **Local Edge Functions:** put the key(s) in the gitignored `supabase/functions/.env`
   (`DEEPSEEK_API_KEY=…`, optionally `AI_PROVIDER=…`) and serve with:
   ```sh
   supabase functions serve --env-file supabase/functions/.env
   ```
   Restart it after adding a function folder: the runtime only serves the functions that existed when
   it started.

Without the key, AI functions fail with a configuration error **before** any credit is spent.

## Checking the live API

`_shared/ai_live_test.ts` makes one real call per provider and job, with an image, and checks the
reply is schema-valid JSON with token usage. It's skipped in CI and for any provider without a key.
From `supabase/functions`, with Deno 2 (Docker works too: see the eval below):

```sh
deno test --frozen --env-file=.env --allow-env --allow-net=api.deepseek.com _shared/ai_live_test.ts
```

## How calls behave

- Each attempt has a timeout (60 s by default) inside an overall deadline (120 s); up to 3 attempts.
- Retried: the provider's transient statuses (DeepSeek 408/429/5xx; Gemini 408/429/500/502/503),
  network errors, timeouts, and blank, non-JSON or schema-failing replies. Not retried: bad request,
  key or balance (DeepSeek 402), blocked or filtered content, and replies cut off at the token limit.
- Failures throw `AiCallError` with the tokens of every attempt, so `ai_usage` records the real cost.
- No `temperature`/`top_p` (ignored in thinking mode on both).
- Prompts and replies are never logged: they contain students' writing.

## Writing scoring and OCR (M6-B2..B5)

| Function | Model (DeepSeek) | Credits | Notes |
|---|---|---|---|
| `score-writing` | `deepseek-flash`, low-effort thinking | 4 (`writing_t1` / `writing_t2`) | Saves a `writing_submissions` row; Free gets the summary only |
| `ocr-writing` | `deepseek-flash`, no thinking | 1 (`ocr`, Gold/Platinum) | Reads 1–2 photos from `writing-photos`; saves nothing |

- **Prompts** live in versioned files in `supabase/functions/_shared/prompts/` (`writing-t1-academic.v1.ts`,
  `writing-t1-general.v1.ts`, `writing-t2.v1.ts`, the shared `writing-rubric.v1.ts`, `ocr-handwriting.v1.ts`).
  `prompts/writing.ts` picks the versions in use and the generation settings. Never edit a released
  version: copy it to `v2`, run the eval, then switch. Each submission stores its `prompt_version`.
- **Checks before spending credits:** the task, the photos' folder and type, the plan, the Task 1
  chart and the key. Anything that fails after spending (the AI, saving the submission) refunds the
  credits, and `ai_usage` still records the tokens.
- **HEIC photos:** DeepSeek can't read them, so `ocr-writing` answers 400 for HEIC. The photo screen
  (M6-F2) should convert photos to JPEG on the device (which also keeps them small).
- **The band** is always recomputed from the four criteria (average, rounded down to a half band),
  never taken from the model. Corrections that don't quote the answer exactly are dropped.

The API tests in `apps/web/e2e/writing-ai.spec.ts` always check the error paths. The real-AI test
(about US$0.01 on DeepSeek) runs only with `E2E_AI=1` (and `E2E_AI_MODEL=gemini-3.8-flash` when
the functions run on Gemini):

```sh
cd apps/web
E2E_AI=1 pnpm exec playwright test writing-ai --project=desktop
```

### Prompt evaluation (M6-B5)

20 answers with target bands in `supabase/functions/_eval/writing_essays.ts`: 10 Task 2, 5 General
Task 1 and 5 Academic Task 1, bands 4 to 8.5. **These were written for the set and are not
examiner-marked**, so they are an informed label, not ground truth. Put examiner-marked scripts in the
gitignored `_eval/writing_essays.local.json` (same fields) for a stronger check.

From `supabase/functions`, with Deno 2 (about US$0.10 for the set on DeepSeek):

```sh
deno run --frozen --env-file=.env --allow-env --allow-net=api.deepseek.com,generativelanguage.googleapis.com --allow-read=_eval --allow-write=_eval/results _eval/writing_eval.ts
```

Options: `--only t2|t1_general|t1_academic`, `--limit 5`, `--concurrency 2`,
`--provider deepseek|gemini` (compare providers), `--thinking off|low|high` (compare effort),
`--dry-run` (no key, no calls).

With Deno 1.x installed locally, run the same command in Docker (Deno reads `.env` itself):

```sh
docker run --rm -v "$PWD:/app" -w /app denoland/deno:latest deno run --frozen --env-file=.env --allow-env --allow-net=api.deepseek.com,generativelanguage.googleapis.com --allow-read=_eval --allow-write=_eval/results _eval/writing_eval.ts
```

It prints each answer's target and AI band, the share within ±0.5 (target 75%), the mean error, the
bias and the cost. It writes a JSON report to `_eval/results/` (gitignored) and exits 1 when under
the target.
