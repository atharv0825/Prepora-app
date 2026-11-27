# Prepora — IELTS Coaching AI Platform
## Implementation Plan: Web App → CI/CD → Analytics → Admin → Staged Asia-Pacific Rollout
**Budget target:** under ₹5,000 to launch (mostly free tiers)
**Version:** 2.0 · Nov 2026
**What changed in v2:** web-first (the mobile app comes later), three credit-based plans (Free / Gold / Platinum, nothing unlimited), a per-user AI cost model, and an Asia-Pacific (APAC) first launch.

---

## 0. Summary

Prepora covers all four IELTS modules: **Speaking, Writing, Listening and Reading**. It launches first as a **responsive web app (installable PWA)** for the **Asia-Pacific region**. Native Android and iOS apps come later and reuse the same backend.

There are **three plans**. Nothing is unlimited: every AI action uses **credits**, and curated content has a monthly allowance.
- **Free:** 8 AI credits/month (+10 welcome credits) and a small curated-test allowance.
- **Gold:** 100 AI credits/month and a larger curated-test allowance.
- **Platinum:** 220 AI credits/month, the largest allowance, plus AI-generated extra practice and the natural examiner voice.

Credit amounts are calculated from the real AI cost per user (§2.6). Users can buy top-up credit packs.

| Layer | Tool | Cost to start |
|---|---|---|
| Web app (students) | **Next.js** (App Router, TypeScript) + Tailwind + shadcn/ui, installable **PWA** | Free |
| Hosting / CDN | **Cloudflare Workers/Pages** via OpenNext (global edge, strong APAC presence, commercial use allowed on the free plan) | Free |
| Backend / DB / Auth | **Supabase** (Postgres, Auth, Storage, Edge Functions), region **Singapore (ap-southeast-1)** | Free tier |
| Large audio files | **Cloudflare R2** (10 GB free, no egress fees) | Free |
| AI: scoring, feedback, generation | **Google Gemini API** paid tier (`gemini-3.8-flash` for scoring, `gemini-3.5-flash-lite` for OCR and examiner turns) | Pay-as-you-go, ≈ ₹10.5 per full Speaking test, ≈ ₹2.8 per Writing task (§2.6) |
| Speech-to-text | **Gemini** (`gemini-3.5-flash-lite`, audio input tokens; Groq Whisper was dropped on 2026-11-26) | ≈ ₹0.2 per minute of audio (audio price to confirm) |
| Examiner voice (TTS) | Browser **Web Speech API** (free), Gemini TTS for Platinum | Free |
| Live speaking agent (later phase) | Gemini Live API | Pay-as-you-go |
| Product analytics + feature flags + rollout | **PostHog Cloud** (1M events/mo free) | Free |
| Error monitoring | **Sentry** (free dev plan) | Free |
| Payments: India | **Razorpay** (UPI, UPI AutoPay, cards, netbanking, INR subscriptions) | Per-transaction fee only |
| Payments: rest of APAC | **Paddle** as Merchant of Record (local currencies, handles GST / consumption tax for you) | Per-transaction fee only |
| Transactional email | **Resend** or Supabase Auth email (free tier) | Free |
| Admin panel (web) | Next.js app on Cloudflare | Free |
| CI/CD | **GitHub Actions** + Wrangler (Cloudflare) + Supabase CLI | Free tiers |
| Domain | `.com` (works better across APAC than `.in`) | about ₹1,000 |

> ⚠️ Free-tier limits, pricing and payment-provider country support change. Check each provider's page before you commit. The figures here are as of late 2026.

---

## 1. Budget Breakdown (launch)

| Item | Cost (₹) |
|---|---|
| Domain name (1 year, `.com`) | ~1,000 |
| AI API buffer (first 1–2 months of testing) | ~1,500 |
| Transactional email / misc buffer | ~500 |
| Everything else (free tiers) | 0 |
| **Total** | **~3,000** |

Going web-first removes the Google Play fee ($25) and the mandatory 14-day closed test, so launch is cheaper and faster.

**Ways to stay under budget:**
- Use Gemini's free tier only for development with test data. Real users' audio and essays go to the paid tier (see the privacy note in §2.6).
- Cache AI outputs, so a generated topic or feedback is never generated twice.
- Every AI action uses credits, and credit amounts are set so worst-case AI cost stays at or below ~40% of net revenue (§2.6–2.7). Free users are capped at about ₹6/month of AI cost.
- Set hard **spend caps** on every paid API key from day one.

---

## 2. Product Scope

### 2.1 Speaking
| Part | Format | App behaviour |
|---|---|---|
| **Part 1: Introduction & interview** | Personal questions | AI examiner asks the questions (browser TTS). The user answers by voice through the microphone. |
| **Part 2: Cue card** | User gets a topic card, **1 minute to prepare**, then **speaks for 1–2 minutes** | Admin adds the topics. The AI analyses the answer and gives feedback. |
| **Part 3: Discussion** | In-depth discussion linked to Part 2 | Connects directly to the Part 2 topic. The user can go deeper or **continue to the next cue card**. Covers the same topic plus other in-depth topics. |

- **Speaking band = average of Parts 1, 2 and 3**, rounded the IELTS way (to the nearest 0.5: x.25 → x.5, x.75 → next whole number).
- Scored on the 4 official criteria: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation.
- **Platinum:** everything above, plus AI-generated topics for extra practice.

### 2.2 Writing
| Task | Content | Input modes |
|---|---|---|
| **Task 1**: Report (Academic) / Letter (General) | Admin topics | 1) Write on paper and **upload a photo** (phone camera or file; AI reads it with OCR and analyses it) 2) **Type directly** in the browser editor |
| **Task 2**: Essay | Admin topics | Same input modes |

- Scored on Task Achievement/Response, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy.
- On desktop, show a "Scan with your phone" QR code that opens the upload page on the user's phone for photo mode.
- **Platinum:** more AI-generated topics for both tasks.

### 2.3 Reading
- **3 passages per practice test.**
- **Academic:** three longer, complex passages. **General Training:** texts from everyday life, the workplace and general topics.
- Question types: MCQ, True/False/Not Given, Yes/No/Not Given, Matching Headings, Matching Information, Matching Features, Sentence Completion, Summary Completion, Note/Table Completion, Flow-chart Completion, Short-answer questions.
- Auto-scored, with the raw score converted to a band using the standard conversion table.
- The web version can mirror the computer-delivered IELTS layout (split screen, highlight, notes), which is useful practice since many APAC test centres now offer computer-delivered IELTS.
- **Platinum:** AI-generated passages for extra practice (admin reviews them before publishing).

### 2.4 Listening
- **4 sections, 40 questions per practice test** (10 per section, one audio per section).
  - Section 1: everyday conversation between two speakers
  - Section 2: monologue in a social context
  - Section 3: conversation between 2–4 speakers in an educational or training context
  - Section 4: academic monologue or lecture
- Question types: MCQ, Matching, Plan/Map/Diagram Labelling, Form, Note, Table, Flow-chart and Sentence Completion, Short-answer.
- **No AI generation.** The admin adds all listening content.

### 2.5 Plans (3 tiers, credit-based, nothing unlimited)

Every plan has **fixed monthly limits**. AI features use **credits**. Content that needs no AI (curated Reading and Listening tests, mock tests) has a monthly **allowance**. The credit amounts come from the per-user cost calculation in §2.6.

| | **Free** | **Gold** | **Platinum** |
|---|---|---|---|
| **AI credits per month** | 8 (+10 one-time welcome credits) | **100** | **220** |
| Curated Reading tests / month | 2 | 15 | 30 |
| Curated Listening tests / month | 2 | 15 | 30 |
| Speaking practice without AI scoring (record and replay) / month | 5 | 30 | 60 |
| Full mock tests / month (AI parts also use credits) | ❌ | 2 | 4 |
| Writing photo upload (OCR) | ❌ | ✅ (1 credit) | ✅ (1 credit) |
| Detailed feedback (model answers, better phrases, corrections) | Summary only | ✅ | ✅ |
| AI-generated extra topics and passages | ❌ | ❌ | ✅ (uses credits) |
| Natural AI examiner voice (Gemini TTS) | ❌ (browser voice) | ❌ (browser voice) | ✅ (uses credits) |
| Live real-time speaking agent (later phase) | ❌ | ❌ | ✅ (credit cost set at launch) |
| Daily credit cap (anti-abuse) | 8 | 40 | 60 |
| Progress dashboard and band history | Basic | Full | Full + weak-area insights |
| Can buy top-up credit packs | ✅ | ✅ | ✅ |

**What the monthly credits buy (examples):**
- **Free (8):** 2 Writing scorings, or 2 Speaking Part 2 cue cards. The 10 welcome credits let a new user try one Speaking Part 2 and one Writing task in the first session.
- **Gold (100):** 3 full Speaking tests (45) + 12 Writing scorings (48) + 7 photo uploads (7).
- **Platinum (220):** 6 full Speaking tests (90) + premium voice on all 6 (24) + 18 Writing scorings (72) + 2 AI-generated Reading tests (30) + 2 generated cue-card sets (4).

**Credit rules:**
- Monthly credits reset at the start of each billing period and **don't roll over**.
- **3-month exam pack:** all 3 months of credits are given **up front** (Gold 300, Platinum 660), valid for 90 days. Students cramming before a test date can use them faster.
- **Top-up packs** are valid for 12 months. Credits are spent from the bucket that expires first.
- If an AI call fails, the credits are **refunded automatically**.
- All numbers (credits per plan, credit cost per action, allowances, caps) live in the `plans` and `credit_costs` tables (§4). The admin can retune them without a deploy when model prices change.

**Credit cost per action:**

| Action | Credits |
|---|---|
| Speaking Part 1 scored (≈4 min, with AI examiner follow-ups) | 5 |
| Speaking Part 2 scored (cue card, up to 2 min) | 4 |
| Speaking Part 3 scored (≈5 min, with AI examiner follow-ups) | 6 |
| **Full Speaking test (Parts 1 + 2 + 3)** | **15** |
| Writing Task 1 scored | 4 |
| Writing Task 2 scored | 4 |
| Photo upload → OCR | 1 |
| Natural examiner voice for one Speaking test (Platinum) | 4 |
| AI-generated cue card + linked Part 3 questions (Platinum) | 2 |
| AI-generated Writing prompt (Platinum) | 1 |
| AI-generated Reading passage + questions (Platinum) | 5 (full 3-passage test = 15) |
| Full mock test, AI parts (Writing T1 + T2 + full Speaking) | 23 |
| Reading / Listening test grading | 0 (uses the test allowance) |

### 2.6 AI cost per user (how the credit numbers were calculated)

**Assumptions:**
- Gemini API **paid tier**, using the prices that apply from **1 Jan 2027** (the expected launch period):
  - `gemini-3.8-flash` (used for scoring and generation): **$1.50 / 1M input tokens**, **$7.50 / 1M output tokens** (output includes thinking).
  - `gemini-3.5-flash-lite` (used for OCR and examiner follow-up questions): **$0.30 / 1M input**, **$2.50 / 1M output**.
  - Audio input = **25 tokens per second**.
- **Gemini `gemini-3.5-flash-lite`** for transcripts (since 2026-11-26; Groq Whisper dropped): audio input at 32 tokens per second, **≈ $0.002 per minute at an assumed $1.00 per 1M audio tokens** (confirm on Google's pricing page).
- Exchange rate **US$1 = ₹88**.
- Token counts are estimates: rubric system prompt ≈ 2,500 tokens; feedback output ≈ 1,200–2,000 tokens plus ≈ 1,500 thinking tokens. Measure the real numbers in the beta (from the `ai_usage` table) and update `credit_costs`.

> ⚠️ Don't use the Gemini **free tier** for real user data. On the free tier Google may use prompts to improve its products, which conflicts with the privacy policy. Use the free tier only for development with test data.

**Cost per action:**

| Action | Calculation | Cost (US$) | Cost (₹) |
|---|---|---|---|
| Speaking Part 2 (2 min) | Gemini STT 2 min (≈$0.004) + Flash input 6,000 tokens (3,000 audio + 3,000 text) ($0.0090) + output 2,700 ($0.0203) | 0.031 | 2.7 |
| Speaking Part 1 (≈4 min, 5 turns) | 5 Flash-Lite examiner turns ($0.0060) + Gemini STT 4 min (≈$0.008) + Flash input 9,000 ($0.0135) + output 2,700 ($0.0203) | 0.043 | 3.7 |
| Speaking Part 3 (≈5 min, 5 turns) | 5 turns ($0.0060) + Gemini STT 5 min (≈$0.010) + Flash input 11,000 ($0.0165) + output 2,700 ($0.0203) | 0.046 | 4.1 |
| **Full Speaking test** | Parts 1 + 2 + 3 | **0.119** | **10.5** |
| Writing Task 2 (typed) | Flash input 3,500 ($0.0053) + output 3,500 ($0.0263) | 0.032 | 2.8 |
| Writing Task 1 (with chart image) | Flash input 4,500 ($0.0068) + output 3,000 ($0.0225) | 0.029 | 2.6 |
| Photo OCR (2 pages) | Flash-Lite input 3,200 ($0.0010) + output 800 ($0.0020) | 0.003 | 0.3 |
| Generated cue card + Part 3 | Flash input 1,000 ($0.0015) + output 1,300 ($0.0098) | 0.011 | 1.0 |
| Generated Reading passage + 13 questions | Flash input 1,500 ($0.0023) + output 5,100 ($0.0383) | 0.041 | 3.6 |
| Natural examiner voice (≈15 questions × 8 s) | ≈3,000 audio output tokens on Flash-Lite TTS (≈$12 / 1M, **confirm on the pricing page**) | ≈0.037 | ≈3.3 |
| Reading / Listening grading | No AI | 0 | 0 |

**1 credit ≈ US$0.01 (₹0.88) of AI budget.** Real costs work out to about **$0.008 per credit**, so each credit price has a ~20% buffer for longer answers and retries.

**Monthly AI cost per user:**

| Plan | Credits | AI cost if all credits used | AI cost at typical use (~50%) |
|---|---|---|---|
| Free | 8 (18 in month 1) | ₹6 (₹13 in month 1) | ₹3 |
| Gold | 100 | ₹70 | ₹35 |
| Platinum | 220 | ₹155 | ₹78 |

Other per-user costs: infrastructure is ≈ ₹0 on free tiers, and about ₹5 per paying user/month after upgrading to Supabase Pro + Workers Paid (≈ ₹2,600/mo) with 500 paying users. Raw speaking audio is deleted after 30 days (transcripts and feedback are kept) to keep storage small.

**Rule used to set credits and prices:** AI cost at **100% credit use must stay at or below ~40% of net revenue** (after payment fees and taxes). Typical use then lands at 15–20%.

### 2.7 Regional pricing (starting points to validate with the beta)

| Region | Gold / month | Platinum / month | 3-month exam pack (Gold / Platinum) | Provider |
|---|---|---|---|---|
| India | ₹299 | ₹599 | ₹799 / ₹1,699 | Razorpay (INR) |
| Nepal, Bangladesh, Sri Lanka, Pakistan | US$4 | US$8 | US$10.99 / US$21.99 | Paddle (USD) |
| Philippines, Vietnam, Indonesia, Thailand, Malaysia | US$5 | US$10 | US$13.99 / US$26.99 | Paddle (local currency) |
| Singapore, Hong Kong, Japan, Korea, Taiwan | US$8 | US$16 | US$21.99 / US$42.99 | Paddle (local currency) |
| Australia, New Zealand | A$12 / NZ$13 | A$24 / NZ$26 | A$32 / A$64 (NZ$35 / NZ$70) | Paddle (local currency) |

**Top-up packs:** India — 50 credits ₹149, 150 credits ₹399 (Razorpay). Other countries — 150 credits US$4.99 (Paddle). There's one pack outside India because Paddle's fixed $0.50 fee makes very small packs unprofitable.

**Margin check (worst case = every credit used):**

| Plan (region) | Price | Net after fees and tax | Max AI cost | AI cost as % of net |
|---|---|---|---|---|
| Gold (India) | ₹299 | ≈ ₹248 (18% GST, ~2% Razorpay) | ₹88 | 35% |
| Platinum (India) | ₹599 | ≈ ₹497 | ₹194 | 39% |
| Gold (South Asia) | US$4 | ≈ US$2.86 (≈13% tax, Paddle 5% + $0.50) | US$1.00 | 35% |
| Platinum (South Asia) | US$8 | ≈ US$6.23 | US$2.20 | 35% |
| Gold (Southeast Asia) | US$5 | ≈ US$3.82 | US$1.00 | 26% |
| Platinum (Southeast Asia) | US$10 | ≈ US$8.14 | US$2.20 | 27% |
| Gold exam pack (India) | ₹799 | ≈ ₹664 | ₹264 | 40% |
| Platinum exam pack (India) | ₹1,699 | ≈ ₹1,411 | ₹581 | 41% |
| Top-up 150 (India) | ₹399 | ≈ ₹331 | ₹132 | 40% |
| Top-up 150 (Paddle) | US$4.99 | ≈ US$3.62 | US$1.50 | 41% |

Prices are set per region (purchasing-power based). The country is detected from Cloudflare's `CF-IPCountry` header and confirmed by the billing address at checkout, to stop VPN price-shopping.

**Ways to improve the margin later:** test whether `gemini-3.5-flash-lite` scores as accurately as Flash in the beta. If it does, AI cost per action drops by about 3×. Use context caching for the rubric prompt. If model prices change, update `credit_costs` rather than plan prices.

---

## 3. System Architecture

```
┌──────────────────────────┐       ┌───────────────────────────────┐
│ Student Web App (Next.js │◄─────►│ Supabase (Singapore region)   │
│ PWA on Cloudflare edge)  │ HTTPS │  - Postgres (+ Row Level Sec.) │
│  - Auth                  │       │  - Auth (Google only)          │
│  - Practice modules      │       │  - Storage (images, user audio)│
│  - MediaRecorder (mic)   │       │  - Edge Functions (AI, grading,│
│  - Camera/file upload    │       │    payment webhooks)           │
│  - PostHog + Sentry JS   │       └───────────┬───────────────────┘
└─────────┬────────────────┘                   │ server-side only
          │ audio streaming                    ▼
          ▼                        ┌───────────────────────────────┐
┌──────────────────────────┐       │ DeepSeek / Gemini (STT, OCR)  │
│ Cloudflare R2 (CDN)      │       │ (scoring, OCR, generation)    │
│ Listening test audio     │       └───────────────────────────────┘
└──────────────────────────┘
                                   ┌───────────────────────────────┐
┌──────────────────────────┐       │ Admin Panel (Next.js,         │
│ PostHog                  │◄──────│ Cloudflare)                   │
│ analytics, flags,        │       │ - Content CRUD, user mgmt     │
│ country + % rollout      │       │ - AI content review queue     │
└──────────────────────────┘       │ - Plans / credits / pricing   │
                                   └───────────────────────────────┘
┌──────────────────────────┐       ┌───────────────────────────────┐
│ Razorpay (India)         │──────►│ Webhook → Supabase Edge Fn    │
│ Paddle (rest of APAC)    │       │ (writes subscriptions table,  │
└──────────────────────────┘       │  sets profiles.plan)          │
                                   └───────────────────────────────┘

Later: Android / iOS app (Expo) ──► same Supabase backend + Edge Functions
```

**Key rules:**
- AI API keys never go to the browser. All AI calls go through **Supabase Edge Functions**, which check the user's auth and plan and **reserve credits** before calling the model.
- **Client-agnostic backend:** all business logic (grading, scoring, credits, allowances, entitlements) lives in Edge Functions and Postgres, not in Next.js pages. The future mobile app then only needs a new UI.
- **Region pinning:** invoke AI Edge Functions in a fixed region (e.g. Singapore, using Supabase's region selection) so calls always come from a country where the Gemini API is available, whatever the user's location.

---

## 4. Database Design (Supabase Postgres)

```sql
-- Users
profiles (id uuid PK -> auth.users, full_name, test_type ['academic','general'],
          target_band numeric, exam_date date, country_code char(2),
          timezone text, plan ['free','gold','platinum'] -- cached from subscriptions --,
          plan_expires_at, role ['user','admin','content_editor'], created_at)

-- Plans & billing
plans (id ['free','gold','platinum'], name, limits jsonb
       -- {monthly_credits:100, welcome_credits:0, daily_credit_cap:40,
       --  reading_tests:15, listening_tests:15, practice_sessions:30, mock_tests:2,
       --  ocr:true, ai_gen:false, premium_voice:false, detailed_feedback:true} --,
       is_active)
prices (id, plan_id NULL -- NULL for top-ups --, kind ['subscription','exam_pack','topup'],
        region ['IN','SA','SEA','EA','ANZ'], period ['month','quarter', NULL],
        credits int -- for exam packs and top-ups --, currency, amount_minor int,
        provider ['razorpay','paddle'], provider_price_id, is_active)
country_regions (country_code PK, region, launch_wave int, is_enabled bool)
subscriptions (id, user_id, plan_id, provider ['razorpay','paddle',
               'google_play','app_store','manual'] -- store values are for the future mobile app --,
               provider_subscription_id, status ['active','past_due','cancelled','expired'],
               current_period_end, currency, amount_minor, created_at)
payment_events (id, provider, event_id UNIQUE, payload jsonb, processed_at)
                -- idempotent webhook processing --

-- Credits (nothing unlimited)
credit_costs (action_key PK -- 'speaking_p1','speaking_p2','speaking_p3','writing_t1',
              'writing_t2','ocr','premium_voice','gen_cue_card','gen_writing_prompt',
              'gen_reading_passage' --, credits int, model, est_cost_usd numeric, is_active)
credit_buckets (id, user_id, source ['monthly','welcome','exam_pack','topup','admin'],
                granted int, remaining int, expires_at, created_at)
                -- spend from the bucket that expires first --
credit_ledger (id, user_id, bucket_id, delta int, reason ['grant','spend','refund',
               'expire','admin_adjust'], action_key, ref_id, created_at)  -- full audit trail
usage_allowance (user_id, period_start, reading_tests_used, listening_tests_used,
                 practice_sessions_used, mock_tests_used)
ai_usage (id, user_id, action_key, model, input_tokens, output_tokens, audio_seconds,
          cost_usd numeric, credits_charged, success bool, created_at)
          -- real cost vs credits charged; used to retune credit_costs --

-- Speaking
speaking_topics (id, part [1,2,3], title, cue_card_points jsonb, parent_topic_id
                 -- Part 3 links to Part 2 --, source ['admin','ai'], status
                 ['draft','review','published'], difficulty, created_by)
speaking_sessions (id, user_id, started_at, part1_band, part2_band, part3_band,
                   overall_band -- IELTS-rounded average --)
speaking_responses (id, session_id, topic_id, part, audio_path, transcript,
                    scores jsonb {fc, lr, gra, pron}, feedback jsonb, band)

-- Writing
writing_tasks (id, task_no [1,2], test_type, prompt, image_path -- for charts --,
               source, status)
writing_submissions (id, user_id, task_id, input_mode ['typed','photo'],
                     photo_path, text, word_count, scores jsonb, feedback jsonb,
                     band, created_at)

-- Reading
reading_tests (id, test_type, title, source, status, min_plan ['free','gold','platinum'])
reading_passages (id, test_id, order_no [1..3], title, body)
reading_questions (id, passage_id, q_no, q_type, prompt, options jsonb,
                   answer jsonb, explanation)

-- Listening
listening_tests (id, title, status, min_plan)
listening_sections (id, test_id, section_no [1..4], audio_url -- R2 --,
                    transcript, context_type, accent ['uk','aus','us','other'])
listening_questions (id, section_id, q_no [1..40], q_type, prompt,
                     options jsonb, image_path -- maps/diagrams --, answer jsonb)

-- Attempts (Reading & Listening)
test_attempts (id, user_id, module, test_id, answers jsonb, raw_score,
               band, time_taken_sec, created_at)

-- Admin & config
app_config (key, value jsonb)  -- maintenance flag, announcement banner, beta mode
waitlist (email, country_code, source, invited_at)
audit_log (id, admin_id, action, entity, entity_id, at)
```

**Row Level Security (RLS):**
- Users can read only `published` content and only their own sessions, submissions, attempts and subscriptions.
- Only `role = admin/content_editor` can insert or update content tables.
- `subscriptions`, `payment_events`, `credit_buckets`, `credit_ledger` and `profiles.plan` are written **only** by Edge Functions (service role) from verified payment webhooks, never by the client.
- Answer keys (`reading_questions.answer`, `listening_questions.answer`) are **never sent to the browser** before submission. Grading runs in an Edge Function.

---

## 5. AI Design

### 5.1 Speaking pipeline
1. The browser records audio with **MediaRecorder** → uploads it to Supabase Storage.
   - Chrome/Edge/Android record WebM/Opus; Safari/iOS records MP4/AAC. Confirm the formats your STT provider accepts. If needed, record WAV with a small WASM encoder, or transcode in the Edge Function.
   - Ask for microphone permission only when the user taps "Start", with a short explanation screen first.
2. Edge Function `score-speaking`:
   - Checks auth and plan, and reserves credits atomically with the Postgres function `spend_credits(user_id, action_key)` (row lock, spends the bucket that expires first, respects the daily cap). Refunds the credits if the AI call fails.
   - Transcribes the audio (Gemini audio input).
   - Sends the transcript, audio-derived signals (speaking rate, pauses, filler words) and the topic to the LLM with an **IELTS band-descriptor rubric prompt**.
   - Returns strict JSON: `{fc, lr, gra, pron, band, strengths[], improvements[], better_phrases[], model_answer}`.
   - Free users get the band and a short summary. Gold/Platinum get the full JSON.
3. The session band is calculated server-side as the IELTS-rounded average of Parts 1–3.
4. Pronunciation feedback must not penalise regional accents (Indian, Filipino, Vietnamese and others). It should judge intelligibility, as the official descriptors do. Add accent-diverse samples to your prompt tests.

### 5.2 Live talking agent (Part 1 and Part 3)
- **v1 (cheap, all plans):** turn-based. Follow-up turns are included in the Part 1 / Part 3 credit cost. The AI asks a question (browser `speechSynthesis` TTS, with a UK/AUS English voice where available) → the user answers → upload → the AI picks the next follow-up question.
- **v2 (Platinum, later):** real-time voice with the Gemini Live API over WebSocket, behind a PostHog feature flag. Measure its cost per minute in the beta and set a per-minute credit cost before release.
- **Natural examiner voice (Platinum):** Gemini TTS instead of the browser voice, 4 credits per Speaking test.

### 5.3 Writing pipeline
- Photo mode (Gold/Platinum): image → Gemini vision OCR → show the extracted text to the user to **confirm or edit** → then score.
- Typed mode: text is scored directly. The editor shows a live word count and an exam timer.
- Output: band per criterion, grammar corrections inline, a rewritten model paragraph, and the word count.

### 5.4 AI content generation (Platinum)
- Generates speaking cue cards with linked Part 3 questions, Writing prompts and Reading passages with questions.
- Generated content goes into a **review queue** (`status = 'review'`) for the admin. Option: auto-publish only to the requesting Platinum user, flagged "AI-generated practice".

### 5.5 Cost controls
- Use Flash/Lite models by default.
- Credits per action from `credit_costs`, spent from `credit_buckets`, with a daily cap per plan. Curated tests are limited by `usage_allowance`.
- Log every AI call to `ai_usage` with real tokens and cost. A weekly check compares real cost per credit with the $0.01 budget and flags actions to retune.
- Cache identical requests. Limit max output tokens.
- Rate-limit per user and per IP (Cloudflare rate limiting rules) to stop abuse of free accounts.
- Set a provider-side spend cap and alerts.

---

## 6. Admin Panel

**Stack:** Next.js + Supabase JS + shadcn/ui, deployed on Cloudflare (separate app on an `admin.` subdomain). Admin login with Supabase Auth, plus a `role` check through RLS and middleware. Optionally put it behind **Cloudflare Access** (free for small teams) as a second lock.

**Modules:**
1. **Dashboard:** DAU/MAU, new sign-ups **by country**, Gold/Platinum conversions, MRR by currency, AI cost this month (from embedded PostHog insights).
2. **Speaking content:** add Part 1 question sets, Part 2 cue cards, and Part 3 discussions linked to a Part 2 topic.
3. **Writing content:** Task 1 (Academic report with chart image upload, General letter) and Task 2 essays.
4. **Reading builder:** create a test → 3 passages → add questions using a type-specific form for each of the 11 types. Set `min_plan`.
5. **Listening builder:** create a test → 4 sections → upload audio to R2 → add 40 questions (with image upload for map/diagram labelling). Set `min_plan`.
6. **AI review queue:** approve, edit or reject AI-generated content.
7. **Users:** search, view progress, change plan manually (support cases), suspend.
8. **Plans, credits & pricing:** edit monthly credits, allowances and daily caps per plan; edit credit cost per action; regional prices, exam packs and top-up packs; enable or disable countries (launch waves).
9. **Credits:** view a user's credit balance and ledger, grant or refund credits (support cases), and see real AI cost per credit from `ai_usage`.
10. **Waitlist & invites:** view the waitlist by country and send beta invites.
11. **Config:** maintenance mode, announcement banner, beta mode.
12. **Audit log:** who changed what.

---

## 7. Analytics Plan (PostHog)

**Identify** users after login with `user_id`, `plan`, `test_type`, `target_band`, `country_code`, `exam_date`.

**Core events:**
| Event | Key properties |
|---|---|
| `landing_viewed` | country, utm_source, page |
| `waitlist_joined` | country, source |
| `signup_completed` | method, country |
| `onboarding_completed` | test_type, target_band, exam_date |
| `module_opened` | module |
| `speaking_part_started` / `_completed` | part, topic_id, duration_sec |
| `speaking_feedback_viewed` | band |
| `writing_submitted` | task_no, input_mode |
| `reading_test_completed` / `listening_test_completed` | test_id, raw_score, band, time_taken |
| `paywall_viewed` | trigger (credits_exhausted, allowance_hit, ai_gen_tap, ocr_tap, mock_test_tap, …), plan_shown |
| `checkout_started` | plan, period, currency, provider |
| `subscription_started` / `_upgraded` / `_cancelled` | plan, period, price, currency, provider |
| `ai_request` | type, latency_ms, tokens, success |
| `credits_spent` | action_key, credits, balance_after, plan |
| `credits_exhausted` / `allowance_hit` | action_key or allowance type, plan, day_of_period |
| `topup_purchased` | pack, credits, price, currency |
| `mic_permission_denied` | browser, os |

**Dashboards to build:**
- Activation funnel: landing → sign-up → first practice → first feedback.
- Free → Gold → Platinum conversion funnel, split **by country and region**.
- Checkout drop-off by provider and payment method (UPI vs card).
- Retention cohorts (D1 / D7 / D30).
- Module popularity, and average band improvement over time.
- AI cost per user and per plan (from `ai_request` events), compared with revenue per plan.
- Credit usage: % of monthly credits used per plan, day of the period when users run out, and top-up conversion after running out.
- Web Vitals (LCP, INP) by country, to catch slow loads on mobile networks.

**Note:** turn on session replay only after masking all text inputs. Mention analytics and cookies in your privacy policy, and show a cookie notice.

---

## 8. Feature Flags & Staged Rollout

There are **four layers of rollout** on the web:

### 8.1 Environments and preview deploys
1. **Preview:** every pull request gets its own preview URL (Cloudflare) connected to **Supabase staging**.
2. **Staging:** the `develop` branch auto-deploys to `staging.prepora.com`.
3. **Production:** tagged releases deploy to `prepora.com`.

### 8.2 Geographic launch waves (APAC first)
Countries are enabled through `country_regions.is_enabled`. Visitors from countries not yet enabled see the landing page and a **waitlist** form instead of sign-up.

| Wave | Countries | Why |
|---|---|---|
| **Wave 1** (private beta → public) | India, Nepal, Bangladesh, Sri Lanka | Largest IELTS test-taker base; you can do support and marketing yourself; Razorpay + UPI for India |
| **Wave 2** | Philippines, Vietnam, Indonesia, Malaysia, Thailand, Pakistan | Large and growing IELTS markets (study and work migration to Australia, NZ, Canada, UK) |
| **Wave 3** | Australia, New Zealand, Singapore, Hong Kong, Japan, South Korea, Taiwan | Higher prices; many test takers are migrants already living there |
| **Later** | Middle East, Africa, Europe, Americas | After APAC product–market fit |

> Mainland China is out of scope: Google services (Gemini, Google Sign-In) are blocked there, and it needs a separate setup.

**Move to the next wave when:** AI feedback quality is rated well in surveys, crash/error rate is low (Sentry), AI cost per paying user is under about 30% of revenue, and support load is manageable.

### 8.3 Feature-level rollout (PostHog feature flags)
- Ship features dark and turn them on remotely, by percentage, plan or country, for example:
  - `live_speaking_agent` → internal users → 10% Platinum → all Platinum
  - `writing_photo_ocr` → 25% → 100% of Gold/Platinum
  - `mock_test_mode` → India beta users → all paid users
  - `new_paywall_design` → A/B experiment
  - `pricing_experiment_sea` → A/B test of prices in Wave 2 countries
- Kill switch: any AI feature can be switched off instantly if costs spike.

### 8.4 Gradual code deployments
- For risky releases, use **Cloudflare Workers gradual deployments**: send 10% → 50% → 100% of traffic to the new version while watching Sentry, then roll back with one command if errors rise.
- The PWA service worker shows a "New version available — refresh" prompt, so users don't stay on stale code.
- `app_config.maintenance_mode` shows a maintenance banner or page without a deploy.

---

## 9. CI/CD Pipeline

**Repo layout (monorepo, pnpm + Turborepo):**
```
prepora/
├── apps/web           (Next.js student app + landing pages, PWA)
├── apps/admin         (Next.js admin)
├── apps/mobile        (later: Expo app)
├── packages/shared    (types, IELTS band rounding, band conversion tables, API client)
├── packages/ui        (shared components)
├── supabase/          (migrations, seed, edge functions)
└── .github/workflows/
```

`packages/shared` holds logic that the future mobile app will reuse, such as band rounding, Supabase types and the API client.

**Branches:** `main` (production) · `develop` (staging) · `feature/*`

**Environments:** create 2 Supabase projects (free tier allows 2), both in Singapore: `prepora-staging` and `prepora-prod`. Use Razorpay **test mode** and the Paddle **sandbox** for staging.

| Trigger | Pipeline (GitHub Actions) |
|---|---|
| Pull request | Lint (ESLint), type-check (tsc), unit tests (Vitest), Supabase migration dry-run, build, **Cloudflare preview deploy**, Playwright smoke tests against the preview |
| Merge to `develop` | Deploy migrations and Edge Functions to **staging** → deploy web + admin to staging |
| Tag `v*.*.*` on `main` | Deploy migrations and functions to **prod** → deploy web + admin to production (gradual deployment for risky releases) → upload source maps to Sentry |
| Hotfix | Branch from `main`, tag a patch version; same pipeline |

**Secrets** (GitHub Actions secrets): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SENTRY_AUTH_TOKEN`. Payment and AI keys (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `GEMINI_API_KEY`) are stored as **Supabase Edge Function secrets**, not in the web app.

**Free-tier notes:** GitHub Actions gives 2,000 free minutes per month on private repos. Keep Playwright to a short smoke suite on PRs and run the full suite nightly.

**Versioning:** semantic versions; the version is shown in the app footer and sent to Sentry and PostHog.

---

## 10. Phased Roadmap

### Phase 0: Setup & Foundations (Week 1)
- [ ] Buy the domain. Create accounts: GitHub, Cloudflare, Supabase (×2, Singapore), PostHog, Sentry, Google AI Studio, Razorpay, Paddle (both need business verification, which can take days — start now).
- [ ] Create the monorepo, Next.js student app, Next.js admin, and shared packages.
- [ ] Set up the design system: colours, fonts, components. Mobile-first layouts (most APAC users will be on phones).
- [ ] Write Supabase migrations for the schema in §4, with RLS policies. Seed `plans`, `prices` and `country_regions`.
- [ ] Basic CI: lint, type-check and preview deploys on PRs.
- [ ] Landing page + waitlist live early, to start collecting beta users.

**Exit:** the web app is deployed to staging and connects to Supabase staging; the waitlist is collecting emails.

### Phase 1: Auth, Onboarding & Admin Core (Weeks 2–3)
- [ ] Supabase Auth: Google Sign-In (only method; email OTP dropped 2026-11-22).
- [ ] Country detection (`CF-IPCountry`) and the launch-wave gate (sign-up vs waitlist).
- [ ] Onboarding: Academic or General, target band, exam date, timezone.
- [ ] Home dashboard showing the 4 modules, credit balance and remaining test allowances.
- [ ] Admin panel: login, role guard, user list, plans & pricing editor, country waves, app config.
- [ ] PostHog and Sentry integrated; identify users.
- [ ] Account deletion and data export in settings.

**Exit:** a user in a Wave 1 country can sign up; others join the waitlist; the admin can log in and see users.

### Phase 2: Reading & Listening, admin-driven (Weeks 3–5)
- [ ] Admin: Reading test builder (3 passages, all 11 question types).
- [ ] Admin: Listening builder (4 sections, R2 audio upload, 40 questions, image upload for maps).
- [ ] App: reading test UI (split view on desktop, tabbed on mobile; timer; highlight).
- [ ] App: listening player (play once, as in the exam, or practice mode with replay), answer sheet. Pre-load audio to handle slow connections.
- [ ] Edge Function `grade-test` → raw score → band conversion → results with explanations.
- [ ] Test allowances per plan (`usage_allowance`) and `min_plan` gating.
- [ ] Results history.

**Exit:** full Reading and Listening tests work end-to-end. These modules don't need AI, so they're the cheapest to ship first.

### Phase 3: Writing with AI (Weeks 5–6)
- [ ] Admin: Task 1 and Task 2 topic management.
- [ ] App: typed editor with word counter, timer and autosave.
- [ ] App: photo upload (camera on mobile, file or "scan with phone" QR on desktop) → OCR → confirm text → submit.
- [ ] Edge Function `score-writing` (Gemini) with rubric prompt and JSON output.
- [ ] Feedback screen: criterion bands, corrections, model answer (summary only for Free).
- [ ] Credit system: `credit_costs`, `credit_buckets`, `credit_ledger`, the `spend_credits` function, refunds on failure, daily caps, monthly grant job, and `ai_usage` cost logging.

### Phase 4: Speaking with AI (Weeks 6–8)
- [ ] Admin: Part 1 question sets, Part 2 cue cards, Part 3 linked discussions.
- [ ] App: microphone permission flow and browser compatibility check (Chrome, Safari iOS, Samsung Internet).
- [ ] App: Part 2 flow: show card → **1-minute prep timer** (with notes) → **record 1–2 minutes** → upload.
- [ ] Part 1 and Part 3 turn-based AI examiner (TTS question → record answer → next).
- [ ] After Part 3: "Go deeper" or "Next cue card".
- [ ] Edge Function `score-speaking` → per-part band → **IELTS-rounded session average**.
- [ ] Feedback screen with transcript, highlighted fillers and better phrases.

### Phase 5: Monetization — Gold & Platinum (Weeks 8–9)
- [ ] Create products and prices: Razorpay subscriptions (INR, monthly + 3-month exam pack) and Paddle products with regional prices, plus **top-up credit packs** (one-time payments).
- [ ] Pricing page that shows the right currency and provider for the visitor's country.
- [ ] Checkout: Razorpay Checkout (UPI AutoPay, cards) for India; Paddle overlay checkout for other countries.
- [ ] Webhooks → Edge Function `billing-webhook` → verify signature → idempotent write to `subscriptions` → update `profiles.plan` → grant credits (monthly, exam pack or top-up bucket).
- [ ] Upgrade (Gold → Platinum), downgrade, cancel, and a "Manage subscription" page (Paddle customer portal; Razorpay cancel via API).
- [ ] Grace period for failed renewals (`past_due` keeps access for a few days).
- [ ] Platinum AI generation for Speaking, Writing and Reading, plus the admin review queue.
- [ ] Paywall triggers: credits exhausted (offer upgrade **or** top-up), allowance hit, OCR tap, mock test tap, AI-generated topic tap.

> ℹ️ **Tax:** Paddle is the Merchant of Record outside India, so it collects and pays GST/VAT/consumption tax in Australia, Singapore, Japan, New Zealand and other countries for you. For Indian customers billed through Razorpay, you handle Indian GST yourself once you cross the registration threshold. Ask a CA before launch.

### Phase 6: Hardening, Legal, SEO & Private Beta (Weeks 9–11)
- [ ] Privacy policy, terms and refund policy (hosted on your domain; Razorpay and Paddle both require these). Cover audio recordings, photos, AI processing, analytics and cookies.
- [ ] Privacy-law basics for Wave 1 and 2 countries: India **DPDP Act**, Sri Lanka PDPA, Philippines Data Privacy Act, Vietnam PDPD, Indonesia PDP Law, Malaysia PDPA. Common needs: clear consent, stated purpose, deletion on request, breach notification. (Wave 3 adds Australia Privacy Act, Singapore PDPA, Japan APPI, Korea PIPA.)
- [ ] SEO: fast landing pages, metadata, sitemap, Open Graph images, and free content pages ("IELTS Speaking Part 2 topics 2026", "band score calculator") to bring in organic traffic.
- [ ] PWA: manifest, icons, "Add to Home Screen" prompt, offline page.
- [ ] Performance on low-end Android phones and slow networks (test on throttled 3G/4G); Lighthouse score above 90 on mobile.
- [ ] Accessibility basics (keyboard navigation, contrast, labels).
- [ ] Offline and error states, loading skeletons.
- [ ] **Private beta:** invite 50–100 waitlist users from Wave 1 countries for 2 weeks. Collect feedback through PostHog surveys, especially on AI band accuracy.
- [ ] Fix top issues.

### Phase 7: Public Launch — Wave 1 (Week 11+)
- [ ] Open sign-ups in India, Nepal, Bangladesh and Sri Lanka.
- [ ] Turn on PostHog flags gradually for heavy AI features.
- [ ] Watch Sentry error rate, Web Vitals, AI cost per user and checkout conversion daily for the first 2 weeks.
- [ ] Launch posts: IELTS Telegram/WhatsApp groups, Instagram reels with speaking tips, YouTube Shorts, Reddit, partnerships with small coaching centres.

### Phase 8: APAC Expansion — Waves 2 & 3 (Weeks 14–20)
- [ ] Enable Wave 2 countries; local marketing (Facebook groups in the Philippines, Facebook/TikTok/Zalo communities in Vietnam, Instagram/TikTok in Indonesia and Malaysia).
- [ ] Pricing experiments per region.
- [ ] Optional localized landing pages (Vietnamese, Bahasa Indonesia, Thai) while the practice content stays in English.
- [ ] Enable Wave 3 countries.

### Phase 9: Mobile Apps & Growth (after web traction)
- [ ] **Android + iOS apps** with React Native + Expo, reusing Supabase, Edge Functions and `packages/shared`.
  - In-app subscriptions must use Google Play Billing and Apple In-App Purchase (consider RevenueCat). Add `google_play` / `app_store` rows to `subscriptions`, so one account has the same plan on web and mobile.
  - Google Play: $25 one-time; new personal accounts need a closed test with 12+ testers for 14 days. Apple: $99/year.
- [ ] Live real-time speaking agent (Gemini Live), Platinum, behind a flag.
- [ ] Streaks, daily goals, email and web-push reminders (mobile push later).
- [ ] Vocabulary builder from feedback.
- [ ] Referral program (free Gold week for both users).
- [ ] B2B: coaching-centre accounts with student seats.

---

## 11. Scaling Triggers (when free stops being enough)

| Signal | Upgrade |
|---|---|
| Supabase DB >500 MB, or you need daily backups or no auto-pause | Supabase Pro (~$25/mo) — do this **before public launch** |
| Cloudflare Workers free request limit reached | Workers Paid (~$5/mo) |
| PostHog >1M events per month | Reduce event volume, or pay-as-you-go |
| Real AI cost per credit > $0.01 (from `ai_usage`) | Raise that action's credit cost, cache more, or move it to Flash-Lite |
| Worst-case AI cost >40% of net revenue for any plan | Lower that plan's monthly credits or raise its price in that region |
| Slow API for Wave 3 users (Australia/Japan) | Supabase read replica, or cache published content at the Cloudflare edge |

> Supabase free projects **pause after about 1 week of inactivity**. Keep staging active during the beta, and upgrade prod before the public launch.

---

## 12. Launch Checklist (one page)

- [ ] Production Supabase (Singapore) with RLS tested (try reading another user's data — it should fail)
- [ ] No API keys in the browser bundle (check the built JS)
- [ ] Spend caps on all AI keys
- [ ] Credits: grant, spend, refund on failure, daily cap, monthly reset, exam-pack and top-up expiry all tested
- [ ] `credit_costs` checked against real `ai_usage` cost from the beta
- [ ] Razorpay and Paddle accounts verified and in live mode
- [ ] Purchase, upgrade, downgrade, renewal, failed payment, cancel and refund tested in test mode for both providers
- [ ] Webhooks verified by signature and processed idempotently
- [ ] Regional prices show correctly for each enabled country
- [ ] Privacy policy, terms, refund policy, cookie notice live
- [ ] Account deletion and data export work
- [ ] Microphone and photo upload tested on Chrome Android, Safari iOS and desktop browsers
- [ ] Sentry and PostHog receiving prod data
- [ ] Maintenance mode and country-wave gate work
- [ ] Private beta completed and top issues fixed
- [ ] Rollout plan written down (Wave 1 → Wave 2 → Wave 3, with move-on criteria)

---

## 13. Suggested Timeline (solo developer)

| Weeks | Phase |
|---|---|
| 1 | Phase 0: Setup + landing page/waitlist |
| 2–3 | Phase 1: Auth + Admin core |
| 3–5 | Phase 2: Reading + Listening |
| 5–6 | Phase 3: Writing AI |
| 6–8 | Phase 4: Speaking AI |
| 8–9 | Phase 5: Gold & Platinum billing |
| 9–11 | Phase 6: Hardening + 2-week private beta |
| 11+ | Phase 7: Public launch, Wave 1 (South Asia) |
| 14–20 | Phase 8: Waves 2 & 3 (Southeast Asia, then ANZ/East Asia) |
| After traction | Phase 9: Mobile apps |

**About 11 weeks to a public Wave 1 launch**, about 3 weeks sooner than the mobile-first plan, because there's no Play Store review or 14-day closed test. Put the waitlist live in Week 1 so you have beta users ready by Week 9.
