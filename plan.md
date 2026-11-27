# Prepora — Build Plan
## Milestones built as parallel backend + frontend tracks

This is the **build order** for the Prepora web app. For product scope, the database schema, AI cost and credits, pricing and the rollout strategy, see [Prepora_Implementation_Plan.md](Prepora_Implementation_Plan.md). Section numbers like §4 point to that document.

---

## 1. How we build

### 1.1 Vertical slices
Every milestone delivers **one complete feature, end to end**: the backend, the student frontend, and the admin screens it needs. We don't build "the whole backend" and then "the whole frontend". At the end of each milestone, the feature works on staging.

```
Milestone = Contract  →  Backend track  ∥  Frontend track  (∥ Admin track)  →  Integrate  →  Ship to staging
```

### 1.2 Contract first, so the two tracks can run in parallel
Each milestone starts with a short **contract step** (half a day to a day) that both tracks agree on:

| Contract piece | Where it lives | Used by |
|---|---|---|
| Database tables + RLS (SQL migration) | `supabase/migrations/` | Backend |
| Generated DB types (`supabase gen types`) | `packages/shared/src/db.ts` | Both |
| Edge Function request/response schemas (Zod) | `packages/shared/src/api/<feature>.ts` | Both |
| Mock responses and seed data | `packages/shared/src/mocks/`, `supabase/seed.sql` | Frontend |
| PostHog event names for the feature | `packages/shared/src/analytics.ts` | Frontend |

Once the contract is merged:
- **Backend** builds the migrations, RLS, Postgres functions and Edge Functions against the Zod schemas.
- **Frontend** builds screens against **local Supabase** (`supabase start` + seed data) and uses **MSW mocks** for any Edge Function that isn't ready yet.
- **Integrate:** remove the mocks, point the screens at the real functions, run the end-to-end tests.

> **Solo developer?** The same structure still works. Do the contract step, then alternate between the backend and frontend steps in any order. Because the contract is fixed, you never wait on yourself, and each half can be handed to a helper or an AI agent independently.

### 1.3 Step IDs
Each step has an ID for tracking it in GitHub Issues or a project board:
- `C` = contract, `B` = backend, `F` = student frontend, `A` = admin panel, `I` = integration and tests.
- Example: `M1-B3` = Milestone 1, backend step 3.

### 1.4 Definition of done (every milestone)
- [ ] Migrations applied to staging; RLS tested (another user's data can't be read).
- [ ] Edge Functions deployed to staging, with input validation (Zod) and error handling.
- [ ] Screens work on mobile (Chrome Android, Safari iOS) and desktop.
- [ ] Loading, empty and error states exist.
- [ ] Unit tests for the logic; one Playwright test for the main happy path.
- [ ] PostHog events firing; errors reaching Sentry.
- [ ] Demo of the exit criteria works on the staging URL.

---

## 2. Milestone overview

| # | Milestone | Backend track | Frontend track | Admin track | Weeks |
|---|---|---|---|---|---|
| M0 | Foundations | Supabase projects, migration pipeline, Edge Function template | Next.js app shell, design system, layout | Admin app shell | 1 |
| M1 | Authentication | Supabase Auth (Google only), profiles, RLS | Sign-up, login, logout, session handling | Admin login + role guard | 2 |
| M2 | Onboarding & country gate | Profile fields, `country_regions`, waitlist | Onboarding flow, waitlist page, home dashboard | Users list, country waves | 2–3 |
| M3 | Plans & credits engine | `plans`, `credit_*` tables, `spend_credits`, monthly grants | Credit balance, allowance meters, plan badge | Plans/credits editor, grant credits | 3 |
| M4 | Reading | Reading tables, `grade-test`, band conversion | Reading test UI, results, history | Reading test builder | 3–4 |
| M5 | Listening | Listening tables, R2 upload, grading | Audio player, answer sheet, results | Listening builder + R2 audio upload | 4–5 |
| M6 | Writing + AI | `score-writing`, `ocr-writing`, AI usage logging | Writing editor, photo upload, feedback screen | Writing task manager | 5–6 |
| M7 | Speaking Part 2 + AI | Audio storage, `score-speaking`, Gemini speech to text | Cue card, prep timer, recorder, feedback | Cue card + Part 3 manager | 6–7 |
| M8 | Speaking Parts 1 & 3 + full test | `examiner-turn`, session band averaging | AI examiner flow, full Speaking test | Part 1 question sets | 7–8 |
| M9 | Billing & subscriptions | Razorpay + Paddle webhooks, subscriptions, credit grants | Pricing page, checkout, manage subscription, paywalls | Revenue view, manual plan change | 8–9 |
| M10 | Platinum extras + mock test | AI generation functions, premium voice, mock test | Generated practice, premium voice, mock test mode | AI review queue | 9 |
| M11 | Hardening, legal, SEO, PWA | Account deletion/export, rate limits, audio cleanup | Landing/SEO pages, PWA, legal pages, performance | Config, audit log, dashboard | 9–10 |
| M12 | Private beta | Prod environment, monitoring, cost checks | Feedback surveys, bug fixes | Beta invites | 10–11 |
| M13 | Public launch — Wave 1 | Gradual deploys, scaling upgrades | Launch fixes, onboarding polish | Daily metrics | 11+ |
| M14 | APAC Waves 2 & 3 | Regional prices, Paddle currencies | Localized landing pages | Enable countries | 14–20 |
| M15 | Mobile apps (later) | Store billing webhooks | Expo app reusing `packages/shared` | — | After traction |

### Dependencies

```
M0 ─► M1 ─► M2 ─► M3 ─┬─► M4 ─► M5 ──────────────┐
                      ├─► M6 ─► M7 ─► M8 ─────────┼─► M10 ─► M11 ─► M12 ─► M13 ─► M14
                      └─► M9 (billing) ───────────┘
```

- **M3 (credits) blocks every AI feature.** Build it before Writing and Speaking.
- **M4/M5 (no AI) and M6–M8 (AI) don't depend on each other.** With two people, run them side by side.
- **M9 (billing) only needs M3.** Start it early if someone is free; Razorpay/Paddle verification takes days anyway.

---

## 3. Milestones in detail

### M0 — Foundations (Week 1)
**Goal:** an empty app and admin deployed to staging, connected to Supabase, with CI running.

| ID | Track | Step |
|---|---|---|
| M0-C1 | Contract | Set up the monorepo (pnpm + Turborepo): `apps/web`, `apps/admin`, `packages/shared`, `packages/ui`, `supabase/`. |
| M0-C2 | Contract | Agree on conventions: folder structure, naming, Zod schema pattern for Edge Functions, error format `{ error: { code, message } }`. |
| M0-B1 | Backend | Create Supabase projects `prepora-staging` and `prepora-prod` (Singapore). Set up local Supabase (`supabase init`, `supabase start`). |
| M0-B2 | Backend | Migration pipeline: first empty migration, `supabase db push` to staging from CI. |
| M0-B3 | Backend | Edge Function template: CORS, auth check, Zod validation, error format, Sentry, region pinning. Deploy a `health` function. |
| M0-B4 | Backend | Type generation script (`supabase gen types` → `packages/shared/src/db.ts`). |
| M0-F1 | Frontend | Next.js app (App Router, TypeScript, Tailwind, shadcn/ui) deployed to Cloudflare via OpenNext. |
| M0-F2 | Frontend | Design system in `packages/ui`: colours, typography, buttons, inputs, cards, dialogs, toasts. Mobile-first. |
| M0-F3 | Frontend | App shell: header, nav, footer with version, 404/500 pages. Supabase client setup. |
| M0-F4 | Frontend | Landing page + waitlist form (writes to a temporary `waitlist` table), to start collecting beta users now. |
| M0-A1 | Admin | Admin Next.js app shell on the `admin.` subdomain, sharing `packages/ui`. |
| M0-I1 | Integration | GitHub Actions: lint, type-check, unit tests, build, Cloudflare preview deploy per PR, deploy to staging on `develop`. |
| M0-I2 | Integration | Sentry and PostHog projects created and connected (no events yet). |

**Exit:** the landing page with waitlist and the admin shell are live on staging; the web app calls the `health` Edge Function; every PR gets a preview URL.

---

### M1 — Authentication (Week 2)
**Goal:** users can sign up, log in and log out; admins can log in to the admin panel.

| ID | Track | Step |
|---|---|---|
| M1-C1 | Contract | Migration: `profiles` table (id, full_name, role, plan, country_code, timezone, created_at) + RLS (user reads/updates own row; role can't be self-edited). |
| M1-C2 | Contract | Shared types: `Profile`, `Role`; auth event names (`signup_completed`, `login_completed`). |
| M1-B1 | Backend | Enable Supabase Auth: Google OAuth only (email OTP dropped 2026-11-22; email provider off). Set redirect URLs for local, preview, staging and prod. |
| M1-B2 | Backend | Trigger: create a `profiles` row on new `auth.users` (default plan `free`, role `user`). |
| M1-B3 | Backend | Postgres helper `is_admin()` for RLS; seed one admin account. |
| M1-B4 | Backend | ~~Auth email templates (OTP) + custom SMTP~~ Not needed while sign-in is Google only (no auth emails). Revisit SMTP when the app sends its own emails. |
| M1-F1 | Frontend | Sign-up and login pages: "Continue with Google" (the only method). |
| M1-F2 | Frontend | Session handling with `@supabase/ssr`: middleware that refreshes the session and protects `/app/*` routes. |
| M1-F3 | Frontend | Logout, "account" menu, basic profile page (name). |
| M1-F4 | Frontend | Identify the user in PostHog and Sentry after login. |
| M1-A1 | Admin | Admin login (same Supabase Auth) + middleware that allows only `role in (admin, content_editor)`. |
| M1-I1 | Integration | Playwright: signed-in user (created with the service role on local Supabase, since Google can't be automated) → lands on `/app`; signed-out → redirected to login. RLS test: user A can't read user B's profile. |

**Exit:** a new user signs up with Google on staging; a non-admin is blocked from the admin panel.

---

### M2 — Onboarding, country gate & home dashboard (Weeks 2–3)
**Goal:** new users finish onboarding and see their home; visitors from countries not yet launched join the waitlist.

| ID | Track | Step |
|---|---|---|
| M2-C1 | Contract | Migration: add `test_type`, `target_band`, `exam_date` to `profiles`; create `country_regions` (country_code, region, launch_wave, is_enabled); move `waitlist` to its final shape. |
| M2-C2 | Contract | Zod schemas for onboarding input; event names `onboarding_completed`, `waitlist_joined`. |
| M2-B1 | Backend | Seed `country_regions` with all APAC countries; enable Wave 1 (IN, NP, BD, LK). |
| M2-B2 | Backend | Edge Function / RPC `get-launch-status(country)` → `enabled` or `waitlist`. |
| M2-B3 | Backend | Store `country_code` on profile at sign-up (from the `CF-IPCountry` header passed by the web app). |
| M2-F1 | Frontend | Middleware reads `CF-IPCountry`; non-enabled countries see the waitlist instead of sign-up. |
| M2-F2 | Frontend | Onboarding flow (3 steps): Academic or General → target band → exam date. Skippable exam date. |
| M2-F3 | Frontend | Home dashboard: 4 module cards (Reading, Listening, Writing, Speaking — "coming soon" until built), days to exam, placeholder for credits. |
| M2-A1 | Admin | Users list: search by email/name, filter by country/plan, view profile. |
| M2-A2 | Admin | Country waves page: toggle `is_enabled` per country; waitlist list with CSV export. |
| M2-I1 | Integration | Playwright: sign up → onboarding → home. Test country gate by faking the header. |

**Exit:** an Indian user signs up and lands on a personalised home; a visitor "from Vietnam" sees the waitlist; the admin can enable Vietnam with one toggle.

---

### M3 — Plans & credits engine (Week 3)
**Goal:** the credit system that every AI feature depends on works, before any AI is built.

| ID | Track | Step |
|---|---|---|
| M3-C1 | Contract | Migration: `plans`, `credit_costs`, `credit_buckets`, `credit_ledger`, `usage_allowance`, `ai_usage` (schema in §4). RLS: users read own buckets/ledger; only service role writes. |
| M3-C2 | Contract | Seed `plans` (Free 8 + 10 welcome, Gold 100, Platinum 220, allowances, daily caps) and `credit_costs` (§2.5). |
| M3-C3 | Contract | Shared types + Zod: `CreditBalance`, `SpendResult`, error codes `INSUFFICIENT_CREDITS`, `DAILY_CAP_REACHED`, `ALLOWANCE_EXCEEDED`, `FEATURE_NOT_IN_PLAN`. |
| M3-B1 | Backend | Postgres function `spend_credits(user_id, action_key, ref_id)`: row lock, checks plan feature flags and daily cap, spends from the bucket that expires first, writes the ledger. Returns a reservation id. |
| M3-B2 | Backend | `refund_credits(reservation_id)` for failed AI calls. |
| M3-B3 | Backend | `use_allowance(user_id, type)` for curated tests and practice sessions. |
| M3-B4 | Backend | Grants: welcome credits on sign-up; scheduled job (pg_cron) for monthly Free grants and expiry of old buckets. |
| M3-B5 | Backend | RPC `get-my-credits` → balance, buckets with expiry, allowances used/remaining, today's spend. |
| M3-B6 | Backend | Shared Edge Function helper `withCredits(action_key, fn)`: reserve → run → log `ai_usage` → refund on error. All AI functions in M6+ use it. |
| M3-B7 | Backend | Tests (pgTAP or SQL tests): concurrent spends can't go negative, daily cap, expiry order, refunds. |
| M3-F1 | Frontend | Credit balance chip in the header; "Credits & usage" page (balance, expiry, allowance meters, history from the ledger). |
| M3-F2 | Frontend | Shared hook `useCredits()` and a reusable "This costs N credits" confirm component. |
| M3-F3 | Frontend | Handlers for the error codes: out-of-credits and allowance dialogs (upgrade/top-up buttons link to a placeholder until M9). |
| M3-A1 | Admin | Plans & credits editor: monthly credits, allowances, daily caps, credit cost per action. |
| M3-A2 | Admin | User detail: credit balance, ledger, "grant credits" and "refund" actions (written to `audit_log`). |
| M3-I1 | Integration | Test with a dummy Edge Function that spends 4 credits: balance updates in the UI; failure refunds. |

**Exit:** a new Free user sees 18 credits; a test action spends credits correctly; running out shows the out-of-credits dialog; the admin can grant credits.

---

### M4 — Reading (Weeks 3–4)
**Goal:** a full 3-passage Reading test, built in admin and taken by students, auto-graded with a band.

| ID | Track | Step |
|---|---|---|
| M4-C1 | Contract | Migration: `reading_tests`, `reading_passages`, `reading_questions`, `test_attempts` + RLS (answers column never readable by users). |
| M4-C2 | Contract | Zod schemas for each of the 11 question types (prompt, options, answer format); `grade-test` request/response; band conversion tables (Academic and General) in `packages/shared`. |
| M4-C3 | Contract | Seed 1 sample Academic and 1 General test. |
| M4-B1 | Backend | View/RPC `get-reading-test(id)` that returns questions **without answers**. |
| M4-B2 | Backend | Edge Function `grade-test`: uses allowance, grades answers per type (case/spelling rules, word limits), raw score → band, saves `test_attempts`, returns results with explanations. |
| M4-B3 | Backend | Unit tests for grading of all 11 types and band conversion. |
| M4-F1 | Frontend | Test list (filter by Academic/General), with allowance shown. |
| M4-F2 | Frontend | Test player: split view on desktop, tabs on mobile; 60-minute timer; highlight text; question navigator; autosave answers locally. |
| M4-F3 | Frontend | Question components for all 11 types (MCQ, TFNG, YNNG, matching, completion types, short answer). |
| M4-F4 | Frontend | Results page: band, score, each question with the correct answer and explanation; attempt history. |
| M4-A1 | Admin | Reading builder: create test → 3 passages (rich text) → type-specific question forms → preview as student → publish. |
| M4-I1 | Integration | Playwright: take the seed test → submit → correct band. Check that the network response never contains answers before submission. |

**Exit:** the admin builds a test in the panel; a student takes it on mobile and gets a correct band; the Free allowance blocks the third test of the month.

---

### M5 — Listening (Weeks 4–5)
**Goal:** a full 4-section, 40-question Listening test with audio from R2.

| ID | Track | Step |
|---|---|---|
| M5-C1 | Contract | Migration: `listening_tests`, `listening_sections`, `listening_questions` + RLS; reuse question types from M4 plus map/diagram labelling. |
| M5-C2 | Contract | Zod for labelling questions (image + labelled points); listening band table. |
| M5-B1 | Backend | Cloudflare R2 bucket + public CDN domain; Edge Function `r2-upload-url` (admin only) returns a signed upload URL. |
| M5-B2 | Backend | Extend `grade-test` for Listening (module = listening). |
| M5-B3 | Backend | Storage bucket for map/diagram images. |
| M5-F1 | Frontend | Audio player: exam mode (play once, no seeking) and practice mode (replay, seek); preload the next section on slow networks. |
| M5-F2 | Frontend | 40-question answer sheet across 4 sections; map/diagram labelling component. |
| M5-F3 | Frontend | Results page with transcript shown after submission. |
| M5-A1 | Admin | Listening builder: test → 4 sections → audio upload to R2 (with progress) → transcript → 10 questions per section → images for labelling → publish. |
| M5-I1 | Integration | Playwright: complete a test in practice mode; test exam-mode play-once on Safari iOS. |

**Exit:** the admin uploads 4 audio files and 40 questions; a student completes the test and gets a band.

---

### M6 — Writing with AI (Weeks 5–6)
**Goal:** students write (or photograph) Task 1 and Task 2 answers and get AI band feedback, paid for with credits.

| ID | Track | Step |
|---|---|---|
| M6-C1 | Contract | Migration: `writing_tasks`, `writing_submissions` + RLS; storage bucket `writing-photos` (private, per-user folders). |
| M6-C2 | Contract | Zod: `score-writing` request (task_id, text) and response (`{ta, cc, lr, gra, band, corrections[], strengths[], improvements[], model_answer}`); `ocr-writing` request/response. Free users get a summary-only shape. |
| M6-C3 | Contract | Mock responses for both functions, so the frontend can build the feedback screen before the AI works. |
| M6-B1 | Backend | Gemini client in the Edge Function shared code (`gemini-3.8-flash`, JSON output mode, timeouts, retries). |
| M6-B2 | Backend | Rubric prompts for Task 1 Academic, Task 1 General and Task 2, based on the public band descriptors. Keep prompts in versioned files. |
| M6-B3 | Backend | Edge Function `score-writing` using `withCredits('writing_t1' / 'writing_t2')`; validates the model's JSON with Zod; trims output for Free users; logs tokens and cost to `ai_usage`. |
| M6-B4 | Backend | Edge Function `ocr-writing` (`gemini-3.5-flash-lite`, 1 credit, Gold/Platinum only). |
| M6-B5 | Backend | Prompt evaluation script: 20 sample essays with known bands → compare AI bands (target: within ±0.5 for most). |
| M6-F1 | Frontend | Task list; editor with live word count, timer (20 / 40 min), autosave to local storage. |
| M6-F2 | Frontend | Photo flow: camera/file upload (up to 2 pages) → "reading your handwriting" → edit extracted text → submit. On desktop, a QR code opens the upload on the phone. |
| M6-F3 | Frontend | Credit confirm ("Scoring costs 4 credits") → progress state → feedback screen: band per criterion, inline corrections, strengths/improvements, model answer; locked sections for Free with an upgrade prompt. |
| M6-F4 | Frontend | Writing history with band trend. |
| M6-A1 | Admin | Writing task manager: Task 1 Academic (with chart image upload), Task 1 General, Task 2; draft/published. |
| M6-I1 | Integration | Swap mocks for real functions; Playwright with a stubbed Gemini response in CI (no real AI calls in CI); one manual end-to-end run on staging with real AI. |

**Exit:** a Gold user types or photographs an essay and gets AI feedback in under ~20 seconds; 4 credits are deducted; a failure refunds them.

---

### M7 — Speaking Part 2 with AI (Weeks 6–7)
**Goal:** the cue-card flow (1 minute to prepare, up to 2 minutes speaking) with AI scoring.

| ID | Track | Step |
|---|---|---|
| M7-C1 | Contract | Migration: `speaking_topics`, `speaking_sessions`, `speaking_responses` + RLS; private storage bucket `speaking-audio`. |
| M7-C2 | Contract | Zod: `score-speaking` request (session_id, topic_id, part, audio_path) and response (`{fc, lr, gra, pron, band, transcript, fillers[], better_phrases[], strengths[], improvements[], model_answer}`); mock response. |
| M7-B1 | Backend | Speech-to-text client for transcripts (Groq Whisper at first; **Gemini since 2026-11-26**: the provider split, DeepSeek for text and Gemini for audio, images and voice; no Groq). |
| M7-B2 | Backend | Audio signals: speaking rate, pause count/length, filler words from the transcript. |
| M7-B3 | Backend | Edge Function `score-speaking` with `withCredits('speaking_p2')`: transcribe → send audio + transcript + signals + rubric to Gemini → validate JSON → save response. Pronunciation judged on intelligibility, not accent. |
| M7-B4 | Backend | Handle WebM/Opus (Chrome) and MP4/AAC (Safari): confirm both work with Gemini (speech to text since 2026-11-26); transcode if needed. |
| M7-B5 | Backend | Prompt evaluation with accent-diverse sample recordings (Indian, Nepali, Filipino, Vietnamese speakers). |
| M7-F1 | Frontend | Microphone permission explainer → browser permission → mic test (level meter). Handle "permission denied" with help per browser. |
| M7-F2 | Frontend | Cue card screen → **1-minute prep timer** with notes box → **recording up to 2 minutes** (MediaRecorder, auto-stop) → playback → submit. |
| M7-F3 | Frontend | Upload with progress and retry (resumable for slow networks) → scoring progress → feedback screen: criterion bands, transcript with fillers highlighted, better phrases, model answer. |
| M7-A1 | Admin | Speaking topics: Part 2 cue cards (title + bullet points) and linked Part 3 questions (`parent_topic_id`). |
| M7-I1 | Integration | Test on Chrome Android, Safari iOS and desktop browsers with real recordings on staging. |

**Exit:** a student records a 2-minute answer on an iPhone and on Android and gets a band with a transcript; 4 credits are deducted.

---

### M8 — Speaking Parts 1 & 3 + full Speaking test (Weeks 7–8)
**Goal:** the turn-based AI examiner and a complete Speaking test with the IELTS-rounded band.

| ID | Track | Step |
|---|---|---|
| M8-C1 | Contract | Zod: `examiner-turn` request (session_id, part, previous Q&A transcripts) and response (`{next_question, done}`); session state machine (P1 → P2 → P3 → finished). |
| M8-C2 | Contract | IELTS band rounding function in `packages/shared` (x.25 → x.5, x.75 → next whole) with unit tests. |
| M8-B1 | Backend | Edge Function `examiner-turn` (`gemini-3.5-flash-lite`): picks the next Part 1 question or a Part 3 follow-up linked to the Part 2 topic. Included in the part's credit cost, not charged per turn. |
| M8-B2 | Backend | Score Parts 1 and 3 in `score-speaking` (`speaking_p1` 5 credits, `speaking_p3` 6 credits). |
| M8-B3 | Backend | Session band: average of Parts 1–3 with IELTS rounding, saved on `speaking_sessions`. |
| M8-F1 | Frontend | Examiner screen: question read aloud with browser TTS (UK/AUS voice when available) and shown as text → record answer → next question. |
| M8-F2 | Frontend | Full test flow: Part 1 (4–5 questions) → Part 2 (M7 flow) → Part 3 (4–5 follow-ups) → overall band; "Go deeper" or "Next cue card" after Part 3. |
| M8-F3 | Frontend | Session results: overall band, per-part bands, feedback per part; Speaking history. |
| M8-A1 | Admin | Part 1 question sets (themes like work, hometown, hobbies). |
| M8-I1 | Integration | Full Speaking test end to end on staging; check total credits = 15 and the rounded band. |

**Exit:** a student completes a full Speaking test with the AI examiner and gets an IELTS-rounded overall band.

---

### M8.5 — Practice streaks (after M8)
**Goal:** students see how many days in a row they have practised, on the home dashboard and on their profile. (The streak part of Phase 9; daily goals and email / web-push reminders stay in Phase 9.)

| ID | Track | Step |
|---|---|---|
| M8.5-C1 | Contract | Zod `Streak` in `packages/shared/src/api/streak.ts` (`timezone`, `today`, `current`, `longest`, `practised_today`, `recent` practice days) + helpers `lastSevenDays()` and `streakMessage()`, with unit tests. |
| M8.5-B1 | Backend | Migration: RPC `get_my_streak()` for `auth.uid()` only (anon refused). A practice day = a day in the student's time zone (`profiles.timezone`, else UTC) with a scored Reading/Listening test, Writing answer or Speaking part. Derived from `test_attempts`, `writing_submissions`, `speaking_responses` (nothing new stored); current run ends today or yesterday; longest run ever. pgTAP tests. |
| M8.5-B2 | Backend | Longer history for the profile: `get_my_streak(p_days int default 7)` (1–120) so `recent` covers the last N days, plus `total_days` (all practice days ever); check `(user_id, created_at)` indexes exist on the three tables; contract `recent` max raised to match. |
| M8.5-F1 | Frontend | Dashboard `StreakCard`: flame + current streak, "Best: N days" badge, next-step message, last-7-days strip with accessible labels; empty and error states. |
| M8.5-F2 | Frontend | Profile (`/app/profile`) "Practice streak" section: current and best streak, total practice days, and a 12-week calendar grid (one square per day, today outlined) from `get_my_streak(84)`. |
| M8.5-I1 | Integration | Playwright on dashboard and profile: empty state → seed practice yesterday + today → 2-day streak on both pages; desktop + mobile. Manual check with a non-UTC time zone near midnight. |

**Exit:** finishing any scored practice counts today; the dashboard card and the profile section show the same current and best streak in the student's own time zone.

---

### M8.6 — Dashboard overview redesign (after M8.5)
**Goal:** the signed-in home shows progress at a glance: goal, credits and streak, plus band by module, practice mix and this week's trend.

| ID | Track | Step |
|---|---|---|
| M8.6-B1 | Backend | RPC `get_my_dashboard()` (own user only): per module the practice count, latest band and average of the last 5; the last 14 days in the student's time zone with count and average band. pgTAP tests. |
| M8.6-C1 | Contract | Zod `DashboardStats` + helpers `estimatedBand()` (IELTS-rounded), `practiceShares()`, `weekSummary()`, with unit tests; `chart-*` module colour tokens (light + dark, palette-validated) and the accent palette in `packages/ui`. |
| M8.6-F1 | Frontend | Dashboard redesign (UI design §7): pill header nav, "Start practising" button, a soft panel with stat cards (goal, streak; credits stay in the header chip) and chart cards (band by module, practice mix, this week); dark mode and mobile. |
| M8.6-I1 | Integration | Playwright: empty states, then seeded tests show in all chart cards; header nav and the "Start practising" link. |

**Exit:** a student sees their estimated band, what they practise most and how this week compares with the last, in light and dark mode, on phone and desktop.

---

### M9 — Billing & subscriptions (Weeks 8–9, can start after M3)
**Goal:** users can buy Gold, Platinum, exam packs and top-ups; credits are granted automatically.

| ID | Track | Step |
|---|---|---|
| M9-C1 | Contract | Migration: `prices`, `subscriptions`, `payment_events` + RLS (service role writes only). Seed regional prices (§2.7). |
| M9-C2 | Contract | Zod: `create-checkout` request (price_id) and response (provider + checkout data); webhook event mapping table (provider event → our action). |
| M9-B1 | Backend | RPC `get-prices(country)` → plans, exam packs and top-ups in the right currency and provider. |
| M9-B2 | Backend | Edge Function `create-checkout`: Razorpay subscription/order (India) or Paddle transaction (others). |
| M9-B3 | Backend | Edge Function `billing-webhook`: verify signatures, store in `payment_events` (idempotent by event id), update `subscriptions` and `profiles.plan`, grant credits (monthly / exam pack / top-up bucket). |
| M9-B4 | Backend | Renewal, upgrade (Gold → Platinum: prorate or immediate credit top-up), downgrade at period end, cancel, failed payment → `past_due` grace period → back to Free. |
| M9-B5 | Backend | Edge Function `manage-subscription`: Paddle customer portal link; Razorpay cancel via API. |
| M9-F1 | Frontend | Pricing page: 3-plan comparison, monthly vs exam pack, local currency from `get-prices`. |
| M9-F2 | Frontend | Checkout: Razorpay Checkout (UPI AutoPay, cards) / Paddle overlay → success page that waits for the webhook → plan updated. |
| M9-F3 | Frontend | Top-up purchase; "Manage subscription" in settings; connect the M3 upgrade/top-up buttons and paywalls. |
| M9-A1 | Admin | Subscriptions list, revenue by currency, manual plan change (support cases). |
| M9-I1 | Integration | Test every flow in Razorpay test mode and Paddle sandbox: buy, renew, upgrade, downgrade, cancel, failed payment, refund, duplicate webhook. |

**Exit:** a test user in India buys Gold with UPI (test mode) and gets 100 credits; a "Philippines" user buys through Paddle in PHP; duplicate webhooks don't grant credits twice.

---

### M10 — Platinum extras + full mock test (Week 9)
**Goal:** AI-generated practice, the natural examiner voice, and the full mock test.

| ID | Track | Step |
|---|---|---|
| M10-C1 | Contract | Zod: `generate-content` request (type: cue_card / writing_prompt / reading_passage) and response; mock test state machine. Migration: `mock_tests` (or reuse `test_attempts` with module = mock). |
| M10-B1 | Backend | Edge Function `generate-content` with `withCredits` (2 / 1 / 5 credits), Platinum only; saves with `source = 'ai'`, visible only to the requesting user, status `review`. |
| M10-B2 | Backend | Edge Function `examiner-voice` (Gemini TTS, 4 credits per Speaking test, Platinum); cache audio for repeated questions. |
| M10-B3 | Backend | Mock test: uses the mock allowance; chains Listening → Reading → Writing → Speaking; overall band = IELTS-rounded average of 4 modules. |
| M10-F1 | Frontend | "Generate new practice" buttons in Speaking, Writing and Reading (Platinum; others see an upgrade prompt). Label "AI-generated practice". |
| M10-F2 | Frontend | Premium voice toggle in the examiner screen. |
| M10-F3 | Frontend | Mock test mode: timed, all 4 modules in order, overall band report. |
| M10-A1 | Admin | AI review queue: approve (publish for everyone), edit, or reject generated content. |
| M10-I1 | Integration | Credit totals correct for generation and mock test (23 credits for AI parts); Free/Gold blocked from Platinum features. |

**Exit:** a Platinum user generates a new cue card and takes a full mock test; the admin promotes a good generated passage to everyone.

---

### M11 — Hardening, legal, SEO & PWA (Weeks 9–10)
**Goal:** the product is safe, legal, fast and findable.

| ID | Track | Step |
|---|---|---|
| M11-B1 | Backend | Account deletion (removes profile, audio, photos, submissions; keeps anonymised payment records) and data export (JSON download). |
| M11-B2 | Backend | Cloudflare rate-limiting rules; per-user request limits on AI functions. |
| M11-B3 | Backend | Scheduled cleanup: delete raw speaking audio after 30 days. |
| M11-B4 | Backend | Security review: RLS on every table, no service key in the browser, signed URLs only, spend caps on DeepSeek and Gemini. |
| M11-B5 | Backend | Weekly cost report: real cost per credit from `ai_usage` vs the $0.01 budget. |
| M11-F1 | Frontend | Legal pages: privacy policy, terms, refund policy, cookie notice. |
| M11-F2 | Frontend | SEO: metadata, sitemap, Open Graph images; free content pages (Speaking topics list, band score calculator). |
| M11-F3 | Frontend | PWA: manifest, icons, install prompt, offline page, "new version available" prompt. |
| M11-F4 | Frontend | Performance and accessibility: Lighthouse > 90 on mobile, test on a low-end Android on throttled 3G/4G, keyboard and contrast checks. |
| M11-F5 | Frontend | Settings: delete account, export data, notification preferences. |
| M11-A1 | Admin | Dashboard (sign-ups by country, conversions, MRR, AI cost), config (maintenance mode, banner, beta mode), audit log viewer. |
| M11-I1 | Integration | Full regression run of all Playwright tests; manual test on 4 browser/device combos. |

**Exit:** the launch checklist in §12 of the implementation plan is mostly ticked; the site scores > 90 on mobile Lighthouse.

---

### M12 — Private beta (Weeks 10–11)
**Goal:** 50–100 real users from Wave 1 countries use the product for 2 weeks.

| ID | Track | Step |
|---|---|---|
| M12-B1 | Backend | Production environment: migrations and functions deployed to `prepora-prod`; Supabase Pro (no auto-pause, backups); live payment keys. |
| M12-B2 | Backend | Monitoring: Sentry alerts, Gemini spend alerts, daily cost check. |
| M12-B3 | Backend | Retune `credit_costs` from real `ai_usage` data. |
| M12-F1 | Frontend | In-app feedback (PostHog surveys), especially "Was this band accurate?" after each AI feedback. |
| M12-F2 | Frontend | Fix the top issues found in the beta. |
| M12-A1 | Admin | Beta invites from the waitlist (invite codes or email). |
| M12-I1 | Integration | Weekly review: activation funnel, AI accuracy ratings, errors, cost per user. |

**Exit:** most beta users rate AI bands as accurate; no critical bugs open; real AI cost per credit ≤ $0.01.

---

### M13 — Public launch, Wave 1 (Week 11+)
| ID | Track | Step |
|---|---|---|
| M13-B1 | Backend | Release with Cloudflare gradual deployment (10% → 50% → 100%); PostHog flags for heavy AI features. |
| M13-F1 | Frontend | Open sign-ups in India, Nepal, Bangladesh, Sri Lanka; onboarding polish from beta feedback. |
| M13-A1 | Admin | Daily metrics review for the first 2 weeks: errors, Web Vitals, AI cost, checkout conversion. |

**Exit:** public sign-ups open in Wave 1; paying users; AI cost within the 40% worst-case rule.

### M14 — APAC Waves 2 & 3 (Weeks 14–20)
- **Backend:** confirm Paddle prices in local currencies (PHP, VND, IDR, THB, MYR, then AUD, NZD, SGD, JPY, KRW…); enable countries in `country_regions`.
- **Frontend:** optional localized landing pages (Vietnamese, Bahasa Indonesia, Thai); practice content stays in English.
- **Admin:** move-on criteria review before each wave (§8.2 of the implementation plan).

### M15 — Mobile apps (after web traction)
- **Backend:** add `google_play` / `app_store` to the billing webhook (or RevenueCat) so one account has the same plan and credits everywhere.
- **Frontend:** Expo app reusing `packages/shared` (types, Zod schemas, band rounding, API client) and the same Edge Functions.

---

## 4. Timeline at a glance

| Week | Backend lane | Frontend lane | Admin lane |
|---|---|---|---|
| 1 | M0: Supabase, CI, function template | M0: app shell, design system, landing + waitlist | M0: admin shell |
| 2 | M1: Auth, profiles · M2: country gate | M1: login/sign-up · M2: onboarding | M1: admin login |
| 3 | M3: credits engine · M4: reading grading | M2: home · M3: credits UI | M2: users, countries · M3: plans editor |
| 4 | M4/M5: grading, R2 | M4: reading player | M4: reading builder |
| 5 | M5 · M6: Gemini client, writing prompts | M5: listening player | M5: listening builder |
| 6 | M6: score-writing, OCR · M7: Gemini speech to text | M6: editor, photo, feedback | M6: writing tasks |
| 7 | M7: score-speaking · M8: examiner-turn | M7: recorder, cue card flow | M7: cue cards |
| 8 | M8: session band · M9: checkout, webhooks | M8: examiner, full test | M8: Part 1 sets |
| 9 | M9: renewals, grants · M10: generation, voice | M9: pricing, checkout · M10: mock test | M9: revenue · M10: review queue |
| 10 | M11: deletion, limits, security · M12: prod | M11: legal, SEO, PWA, performance | M11: dashboard, config |
| 11 | M12: monitoring, retune credits | M12: beta fixes | M12: invites |
| 11+ | M13: launch Wave 1 | M13: launch polish | M13: daily metrics |

**Milestone demos:** end of each week, demo the finished milestone on staging and tick its exit criteria before starting the next dependent milestone.
