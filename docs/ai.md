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

## Testing without AI calls: the ai-stub function (M6-I1)

`supabase/functions/ai-stub` answers like DeepSeek's chat completions API, so `score-writing` and
`ocr-writing` run for real (auth, credits, Storage, saving, refunds) while no AI is called.

- It's **off unless `AI_STUB=1`**: everywhere else it answers 404, so deploying it with the other
  functions is harmless. Never set `AI_STUB` on staging or production.
- Point DeepSeek at it with `DEEPSEEK_API_URL=http://kong:8000/functions/v1/ai-stub`. That's the
  local gateway as seen from inside the edge runtime.
- Replies are deterministic:
  - bands come from the word count; corrections quote real mistakes in the answer ("alot",
    "peoples", "dont"…); feedback is marked "(Stub AI)";
  - OCR returns one fixed page per photo.
- Test hooks in the answer: `STUB_FAIL` → HTTP 500 (refund path); `STUB_BAD_JSON` → an invalid
  reply (retries, then refund).
- **CI** (`.github/workflows/e2e.yml`) writes `DEEPSEEK_API_KEY=e2e-stub`, `DEEPSEEK_API_URL=…/ai-stub`
  and `AI_STUB=1` into `supabase/functions/.env`, and runs Playwright with `E2E_AI=1 E2E_AI_STUB=1`.

**Locally, without spending:** add these lines to `supabase/functions/.env` instead of (or after)
your real key, restart `supabase functions serve --env-file supabase/functions/.env`, then:

```sh
DEEPSEEK_API_URL=http://kong:8000/functions/v1/ai-stub
AI_STUB=1
```

```sh
cd apps/web
E2E_AI=1 E2E_AI_STUB=1 pnpm exec playwright test writing-ai writing-ui --project=desktop
```

With your real key (and no `DEEPSEEK_API_URL`), `E2E_AI=1` alone runs the same tests against
DeepSeek: about US$0.03. `E2E_AI=0` means "the functions have no AI key" (opt-in; that test would
make a paid call if a key were present).

## Manual end-to-end run on staging with real AI (M6-I1)

Done once by an account owner after the M6 PRs are merged and deployed. Each run costs a few cents.

1. **Secrets:** `supabase secrets set DEEPSEEK_API_KEY=<key>` on the staging project. Make sure
   `DEEPSEEK_API_URL` and `AI_STUB` are **not** set there (`supabase secrets list`).
2. **Deploy:** merging to `develop` deploys the functions and migrations to staging (Actions:
   "Deploy functions to staging", "Push migrations to staging"). Check both are green.
3. **Content:** in the staging admin panel → Writing, create and publish:
   - one Task 2 essay;
   - one Task 1 Academic task, with a chart uploaded to writing-images and a description.
4. **As a Free student** (staging web app), write the Task 2 essay (250+ words) and get the score:
   - the confirm shows 4 credits and the balance drops by 4;
   - the feedback shows four criteria, a band and the summary, with locked sections.
5. **As a Gold student** (set the plan in admin → Users):
   - score the Task 1 Academic task: full feedback, highlights that match the text, a model answer;
   - photo upload: photograph a handwritten page **on a phone** (try an iPhone: HEIC), read it
     (1 credit), check the text, score it.
6. **In the database** (staging SQL editor):
   - `ai_usage` has a row per call with `model = deepseek-flash`, real tokens, `cost_usd > 0` and
     `success = true`;
   - `writing_submissions.prompt_version` is `t2-v1` / `t1a-v1`.
7. Note the band you'd expect against the AI band, the time each call took and the cost, in `log.md`.

## Speech to text for Speaking: Groq Whisper (M7-B1)

DeepSeek takes no audio, so Speaking answers are transcribed by **Groq Whisper**
(`whisper-large-v3-turbo`) in `supabase/functions/_shared/stt.ts`, with **word timings** for the
signals (M7-B2). The transcript and signals then go to the AI (`ai.ts`) for scoring.

| | |
|---|---|
| Endpoint | `POST https://api.groq.com/openai/v1/audio/transcriptions` (multipart; `verbose_json`, word + segment timestamps) |
| Key secret | `GROQ_API_KEY` (console.groq.com → API keys) |
| Price | $0.04 per hour of audio, at least 10 s billed: a 2-minute answer ≈ $0.0013 |
| Formats | webm (Chrome/Android), m4a/mp4 (Safari/iOS), ogg, mp3, wav, flac; 25 MB per file (free tier) |
| Limits | per organisation; check console.groq.com/settings/limits (audio seconds per hour/day) |

- **Fillers:** Whisper tends to leave out "um" and "uh", so the request's `prompt` is written with fillers to
  keep them. The Speaking eval (M7-B5) checks it.
- Retried: 429 (Retry-After), 498, 500, 502, 503, network errors and timeouts. Not retried: 400, 401, 413, 422.
  Groq doesn't charge for server errors.
- `GROQ_API_URL` overrides the endpoint (for a stub in CI, as `DEEPSEEK_API_URL`).
- Data: check Groq's data policy (console.groq.com/docs/your-data) before real students' recordings are sent,
  and name it in the privacy policy, as for DeepSeek.

Setup: `supabase secrets set GROQ_API_KEY=<key>` per environment; locally, `GROQ_API_KEY=…` in
`supabase/functions/.env`. Live check (one ~2 s generated WAV, ≈ $0.0001):

```sh
deno test --frozen --env-file=.env --allow-env --allow-net=api.groq.com _shared/stt_live_test.ts
```

### Speaking signals (M7-B2)

`supabase/functions/_shared/speaking.ts` measures, from the transcript and Whisper's timings:

- **words per minute** over the speech itself (first word to last), not the silence around it;
- **pauses**: silences of 1 s or more between words, and the longest one;
- **fillers**: um, uh, er, erm, ah, hmm, "you know", "I mean" (whole words; "like" and "so" are left to the AI);
- **transcript confidence** (0–1): how sure Whisper was, a hint about intelligibility for Pronunciation. It's
  never a judgement of accent.

## Speaking scoring (M7-B3..B5)

`score-speaking` (Part 2 now; Parts 1 and 3 with the examiner in M8):

- **Checks before spending:** the session (the caller's, in progress, a mode with this part, not yet scored:
  409), the published cue card, the recording (own folder, ≤ 15 MB, **real audio by its first bytes**), the
  plan and both keys (`GROQ_API_KEY`, the AI's).
- **Inside `withCredits('speaking_p2')`**, 4 credits:
  1. Groq transcribes with word timings.
  2. Under 20 words is refused (400) and refunded.
  3. The signals are measured.
  4. The AI scores the transcript and signals with `prompts/speaking-part2.v1.ts` (`s2-v1`).
  5. Better phrases that don't quote the transcript are dropped, and the band is recomputed.
  6. The response is saved with the plan's feedback, and a single-part session is completed with its band.
- **One `ai_usage` row** per scoring: the AI model and tokens, Whisper's `audio_seconds`, and **the cost of both**
  (≈ $0.0013 Whisper + ≈ $0.004 DeepSeek for 2 minutes).
- **Pronunciation without audio:** DeepSeek reads text, so Pronunciation is judged on intelligibility from the
  transcript and `transcript_confidence`, never accent. The prompt keeps it between 5 and 8 unless the evidence
  is strong. If the Speaking eval shows this isn't good enough, the plan's fallback is Gemini with audio for
  this step.

**Formats (M7-B4):** the function reads the container from the file's first bytes (`_shared/audio.ts`), so
Chrome's WebM/Opus and Safari's fragmented MP4/AAC both reach Whisper with the right extension, whatever type
the upload was labelled with. Groq accepts both, so there's no transcoding. The fixtures in
`_eval/speaking/fixtures/` are synthetic speech encoded like each browser. `_shared/stt_live_test.ts` sends both
to Groq (add `--allow-read=_eval`).

**CI:** `GROQ_API_URL` also points at the ai-stub, which answers transcriptions with a fixed, timed transcript.
`stub-short`/`stub-fail` in the file name exercise the too-short and AI-failure paths.

**Accent evaluation (M7-B5):** see `supabase/functions/_eval/speaking/README.md`. The eval needs real recordings
from consenting speakers, kept local.
