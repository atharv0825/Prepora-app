# Prepora — Build Log

Running log of what has been done in this repo, newest entry at the bottom.

---

## 2026-11-21 — Monorepo folder structure created

**Goal:** Set up folders so frontend and backend can be built in parallel. Folders only; no code, configs or packages installed yet.

**Source:** `Prepora_Implementation_Plan.md` §9 (repo layout), §3 (architecture), §6 (admin modules), §10 (roadmap).

**What was done**
- Created the monorepo layout (pnpm + Turborepo, per the plan).
- Added an empty `.gitkeep` to every leaf folder so git tracks the empty folders. Delete each one once real files go in.

**Structure**

```
prepora/
├── apps/
│   ├── web/                      FRONTEND: student app + landing pages (Next.js PWA)
│   │   ├── public/icons/         PWA icons
│   │   ├── src/app/
│   │   │   ├── (marketing)/      landing, waitlist, SEO pages
│   │   │   ├── (auth)/           sign-in / sign-up / onboarding
│   │   │   ├── (app)/            dashboard, speaking, writing, reading,
│   │   │   │                     listening, results, pricing, settings
│   │   │   └── api/              thin route handlers only (business logic lives in supabase/)
│   │   ├── src/components/       layout, speaking, writing, reading, listening, billing
│   │   ├── src/lib/              supabase client, analytics (PostHog/Sentry)
│   │   ├── src/hooks/
│   │   ├── src/styles/
│   │   └── tests/e2e/            Playwright smoke tests
│   ├── admin/                    FRONTEND: admin panel (Next.js, admin. subdomain)
│   │   └── src/app/
│   │       ├── (auth)/login/
│   │       └── (admin)/          dashboard, speaking, writing, reading, listening,
│   │                             review-queue, users, plans, credits, waitlist,
│   │                             config, audit-log   (the 12 modules in plan §6)
│   └── mobile/                   placeholder for the later Expo app (Phase 9)
├── packages/
│   ├── shared/                   SHARED: used by frontend and future mobile app
│   │   ├── src/types/            DB / API types
│   │   ├── src/ielts/            band rounding, raw→band conversion tables
│   │   ├── src/api/              API client for Edge Functions
│   │   ├── src/constants/
│   │   └── tests/                Vitest unit tests
│   └── ui/src/components/        shared shadcn/ui components
├── supabase/                     BACKEND
│   ├── migrations/               schema from plan §4 + RLS policies
│   ├── seed/                     plans, prices, country_regions, credit_costs
│   ├── tests/                    RLS / DB function tests
│   └── functions/                Edge Functions (all AI + billing logic)
│       ├── _shared/              auth, credits (spend/refund), Gemini/Groq clients, CORS
│       ├── score-speaking/
│       ├── examiner-turn/        Part 1/3 AI examiner follow-up questions
│       ├── score-writing/
│       ├── ocr-writing/          photo → text
│       ├── grade-test/           Reading/Listening auto-grading
│       ├── generate-content/     Platinum AI-generated topics/passages
│       ├── billing-webhook/      Razorpay + Paddle webhooks
│       └── grant-monthly-credits/ scheduled monthly credit grant
├── .github/workflows/            CI/CD (lint, typecheck, test, deploy)
└── docs/                         project docs
```

**How work splits for parallel development**
- **Frontend track:** `apps/web`, `apps/admin`, `packages/ui`
- **Backend track:** `supabase/` (migrations, seed, functions)
- **Contract between them:** `packages/shared` (types + API client). Agree on these types first so both tracks can work independently.

**Notes / decisions**
- `supabase/functions` names: `score-speaking`, `score-writing`, `grade-test` and `billing-webhook` come straight from the plan. `examiner-turn`, `ocr-writing`, `generate-content` and `grant-monthly-credits` are my split of other features the plan describes (examiner turns §5.2, OCR §5.3, AI generation §5.4, monthly grant job Phase 3). Rename freely.
- `.gitignore` is still empty; fill it when tooling is added.

**Next steps**
- Initialise pnpm workspace + Turborepo (`package.json`, `pnpm-workspace.yaml`, `turbo.json`).
- Scaffold Next.js in `apps/web` and `apps/admin`.
- `supabase init` and write the first migration.

---

## 2026-11-21 — M0-B2: Migration pipeline

**Goal (plan.md):** first empty migration, `supabase db push` to staging from CI.

**Gaps found from M0-B1 (please review)**
- `supabase init` had not been run in this repo, so there was no `supabase/config.toml`. Ran it as part of this step.
- Cloud projects don't match the plan:
  - `Prepora`: **ap-northeast-2 (Seoul)**
  - `prepora-staging`: **ap-northeast-1 (Tokyo)**
  - The plan wants **both in Singapore (ap-southeast-1)**, named `prepora-staging` / `prepora-prod`. A project's region can't be changed after creation; the only fix is to recreate it. CI reads the project ref from a secret, so recreating later only means updating that secret.
- Docker Desktop was not running, so `supabase start` (local stack) has not been verified on this machine.

**What was done**
- `supabase init` → `supabase/config.toml`, `supabase/.gitignore`.
  - `project_id` set to `prepora`.
  - Seed path changed from `./seed.sql` to `./seed/*.sql` to match the `supabase/seed/` folder.
  - Postgres `major_version = 17` (matches the cloud projects).
- First migration: `supabase/migrations/20261121094946_init.sql`. It's a no-op baseline (`select 1;`) that proves the pipeline works.
- CI workflow: `.github/workflows/db-migrations.yml`
  - **validate** (every run): `supabase db start` on a fresh Postgres (applies all migrations + seeds), then `supabase db lint --level error`.
  - **dry-run-staging** (PRs touching `supabase/**`): `supabase link` + `supabase db push --dry-run`. Skipped for fork PRs.
  - **push-staging** (push to `develop`, or manual run): `supabase link` + `supabase db push`.
  - CLI pinned to `2.116.0` (same as local).
- Root `.gitignore`: ignores `.env*` (except `.env.example`), `node_modules`, Next/Turbo/OpenNext/Wrangler build output.
- Removed the `.gitkeep` files from `supabase/migrations/` and `.github/workflows/`.

**Not verified yet**
- The workflow has never run (no commits, no GitHub remote, no `develop` branch). Only the YAML syntax was checked.
- The migration has not been applied anywhere yet (no Docker locally, no staging DB password used).

**To finish M0-B2 (manual steps)**
1. Push the repo to GitHub and create a `develop` branch.
2. GitHub → Settings → Secrets and variables → Actions:
   - Repository secret `SUPABASE_ACCESS_TOKEN`
   - Create environment `staging` with secrets `SUPABASE_PROJECT_REF` (staging ref) and `SUPABASE_DB_PASSWORD`.
3. Open a PR that touches `supabase/` → check that `validate` and `dry-run-staging` pass → merge to `develop` → check that `push-staging` applies `20261121094946_init` (Supabase dashboard → Database → Migrations).
4. Optional: start Docker Desktop and run `supabase start` locally to finish verifying M0-B1.

**Next:** M0-B3 — Edge Function template + `health` function.
