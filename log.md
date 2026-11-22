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

---

## 2026-11-21 — M0-B3: Edge Function template + `health` function

**Goal (plan.md):** Edge Function template with CORS, auth check, Zod validation, error format, Sentry and region pinning. Deploy a `health` function.

**Files**
| File | What it does |
|---|---|
| `supabase/functions/_shared/deps.ts` | One place for pinned third-party versions: `zod@4.6.7`, `@supabase/supabase-js@2.119.2`, `@sentry/deno@11.16.0`. Always import from here so all modules share one copy. |
| `_shared/handler.ts` | **The template.** `createHandler(options, fn)` handles OPTIONS preflight, method check, region pinning, auth, input parsing (query string for GET/DELETE, JSON body otherwise) + Zod validation, JSON responses, an `x-request-id` header, the error format, and Sentry for unexpected errors. Gives `fn` a context: `{ req, requestId, input, user, supabase (RLS, as the caller), admin() (service role, lazy) }`. |
| `_shared/errors.ts` | `HttpError` + `errors.*` helpers. Error format `{ error: { code, message, details? } }`; `details` only on `validation_failed`. Codes: bad_request, validation_failed, unauthorized, forbidden, not_found, method_not_allowed, conflict, insufficient_credits (402), rate_limited, wrong_region (421), internal. |
| `_shared/auth.ts` | `userClient(req)` (RLS applies), `adminClient()` (bypasses RLS), `getUser()`. No token or the anon key → anonymous; bad or expired token → 401; auth service down → 500 (not a misleading 401). |
| `_shared/cors.ts` | Allow-list from the `ALLOWED_ORIGINS` secret (comma list; `https://*.workers.dev`-style wildcards for previews). Unset → `*` (local dev). |
| `_shared/region.ts` | `PINNED_REGION` (default `ap-southeast-1`, override with the `PINNED_REGION` secret), `currentRegion()` from `SB_REGION`. Functions with `requirePinnedRegion: true` reject other regions with 421 `wrong_region`. Turn it on for every AI function. |
| `_shared/sentry.ts` | Sentry, initialised lazily, no-op without the `SENTRY_DSN` secret. Tags: function, request_id, execution_id, region, user id. Flushes before the response. |
| `health/index.ts` | `GET/POST /functions/v1/health` (`?echo=` optional, max 100 chars). Returns status, version, env, region, pinnedRegion, inPinnedRegion, authenticated, time. Auth optional. |
| `supabase/config.toml` | `[functions.health] verify_jwt = false` (public endpoint; the template does auth itself). |
| `.github/workflows/edge-functions.yml` | PR: `deno check` every function. Push to `develop`: deploy every function folder that has an `index.ts` to staging (`--use-api`, no Docker). |

**Region pinning, important for the frontend:** Supabase runs a function in the region **nearest the caller** unless the caller pins it. The frontend must call AI functions with `supabase.functions.invoke(name, { region: FunctionRegion.ApSoutheast1 })` (or the `x-region: ap-southeast-1` header). Put this in the shared API client (`packages/shared/src/api/`).

**Verified**
- `deno check` passes (local Deno 1.37; CI uses Deno 2).
- Locally under Deno with dummy env: OK response, anon key treated as anonymous, 405, `validation_failed` with field details, invalid JSON → 400, bad token → 401, auth service unreachable → 500 + logged, CORS wildcard subdomain allowed, unknown origin gets no `Access-Control-Allow-Origin`.
- **Deployed to `prepora-staging`** (`xvaxqiumdmgdvmbsqcub`): https://xvaxqiumdmgdvmbsqcub.supabase.co/functions/v1/health
  - No pin → ran in `ap-south-1` (Mumbai); with `x-region: ap-southeast-1` → ran in Singapore. Pinning works.
  - 405 and 401 error bodies are correct in the cloud too.
- Not tested: Sentry path (no DSN yet; M0-I2), `requirePinnedRegion` rejection in the cloud (health doesn't enable it), the new CI workflow (no GitHub remote yet).

**Decisions / notes**
- Shared Zod schemas between Deno functions and the Next.js apps (`packages/shared/src/api/`) aren't wired up yet. The Supabase deploy bundler may not include files outside `supabase/functions/`. Decide this in M0-C2 / M0-B4. For now the schema lives in the function.
- `health` responds with `env: "local"` because no `APP_ENV` secret is set on staging (my attempt to set it was blocked by permissions).

**Manual steps for you**
1. Set the staging function secrets:
   `supabase secrets set APP_ENV=staging --project-ref xvaxqiumdmgdvmbsqcub`
   Later: `ALLOWED_ORIGINS` (once the web/admin URLs exist), `SENTRY_DSN` (M0-I2), `APP_VERSION` (from CI).
2. If you recreate the projects in Singapore (see M0-B2 notes), redeploy: `supabase functions deploy health --project-ref <new-ref> --use-api`.

**Next:** M0-B4 — type generation script (`supabase gen types` → `packages/shared/src/db.ts`).

---

## 2026-11-21 — M0-B4: DB type generation

**Goal (plan.md):** type generation script (`supabase gen types` → `packages/shared/src/db.ts`).

**What was done**
- `scripts/gen-db-types.mjs`: a Node script (cross-platform; works on Windows and in CI). It runs `supabase gen types typescript --schema public` and writes **the same file to two places**:
  - `packages/shared/src/db.ts` → web, admin, future mobile app
  - `supabase/functions/_shared/db.ts` → Edge Functions (the deploy bundler only ships files inside `supabase/functions/`, which settles the open question from M0-B3 for DB types)
  - Sources: `--local` (default), `--linked`, `--project-id <ref>` (ref format is validated).
  - `--check`: exits 1 if either file is out of date. The header has no timestamp, so output is identical for an unchanged schema.
- Root `package.json` (minimal, `private`, scripts only; M0-C1 turns it into the full pnpm/Turborepo workspace):
  - `pnpm db:types` (local DB), `pnpm db:types:linked`, `pnpm db:types:check`
- CI (`db-migrations.yml` → `validate` job): after migrations are applied to a fresh DB, runs `node scripts/gen-db-types.mjs --check`. **A PR that changes the schema without regenerating types fails.** The PR trigger now also covers `scripts/gen-db-types.mjs` and `packages/shared/src/db.ts`.
- Edge Functions now use typed clients: `DbClient = SupabaseClient<Database>` in `_shared/auth.ts`; `ctx.supabase` / `ctx.admin()` in `handler.ts` are typed, so queries are checked against the schema.
- Generated the first `db.ts` (empty `public` schema, plus the CLI's helpers: `Tables<>`, `TablesInsert<>`, `TablesUpdate<>`, `Enums<>`).

**Verified**
- Docker was running this time. `supabase db start` applied `20261121094946_init.sql` locally (also confirms M0-B2 locally). The warning `no files matched pattern: supabase/seed/*.sql` is expected (no seeds yet).
- Generate → `--check` passes; both files byte-identical.
- Drift test: created a temporary table `public._typegen_probe` in the local DB → `--check` failed (exit 1) → regenerate added its `Row/Insert/Update` types → dropped the table → regenerated → `--check` passes, no leftovers.
- `deno check` passes for `_shared/db.ts` and `health` with typed clients. Staging `health` was not redeployed (type-only change, same runtime behaviour).

**Notes**
- Another local Supabase stack, **`supabase_db_Backend`**, is running in Docker (a different project). It wasn't touched. Only `supabase_db_prepora` was used.
- The local Prepora DB was left running; stop it with `supabase stop`.
- Workflow when changing the schema: `supabase migration new <name>` → write SQL → `supabase db reset` → `pnpm db:types` → commit migration + both `db.ts` files.

**M0 backend track (B1–B4) done.** Open items carried over: project regions (Seoul/Tokyo vs Singapore), `APP_ENV` secret on staging, GitHub remote + secrets so the CI workflows can run.

---

## 2026-11-21 — M0-F1: Next.js web app on Cloudflare (OpenNext)

**Goal (plan.md):** Next.js app (App Router, TypeScript, Tailwind, shadcn/ui) deployed to Cloudflare via OpenNext.

**Status:** built and verified in Cloudflare's runtime locally. **Not deployed yet:** Wrangler isn't logged in to Cloudflare (needs a browser login), and no GitHub remote/secrets exist for CI.

**Monorepo bits added (part of M0-C1)**
- `pnpm-workspace.yaml`: workspaces `apps/*`, `packages/*`. `allowBuilds`: `esbuild` and `workerd` allowed (they download platform binaries); `sharp` and `unrs-resolver` not.
- Root `package.json`: `packageManager: pnpm@12.21.0`; scripts `dev:web`, `preview:web`, `deploy:web` (plus the `db:types*` scripts from M0-B4).
- `pnpm-lock.yaml` created.
- pnpm 12 enforces a **minimum release age** (packages published in the last ~24 h are refused). Pinning the newest Wrangler made pnpm silently add `minimumReleaseAgeExclude` entries (incl. a miniflare beta). I removed them and used `wrangler@^4.148.0` → resolved to 4.165.0. No policy exceptions remain.

**apps/web (`@prepora/web`)**
- Generated with `create-next-app@16.4.6` (TS, Tailwind v4, ESLint, App Router, `src/`, `@/*` alias), then merged into the existing folders.
- Versions: Next 16.4.6 (Turbopack), React 19.3, Tailwind 4.3, `@opennextjs/cloudflare` 1.20.18, Wrangler 4.165.0.
- **OpenNext/Cloudflare config** (written by hand instead of `opennextjs-cloudflare migrate`, which would install `@latest` packages bypassing the age policy, and create an R2 bucket):
  - `wrangler.jsonc`: **top level = staging** (`prepora-web-staging`), `env.production` = `prepora-web`. A bare deploy can never hit prod. `nodejs_compat`, `compatibility_date 2026-11-18`, assets binding, self-reference service binding, `APP_ENV` var, observability on.
  - `open-next.config.ts`: default config, no incremental cache yet (add R2 cache when we use ISR/revalidation).
  - `next.config.ts`: `initOpenNextCloudflareForDev()`; `images.unoptimized` (no Cloudflare Images binding yet).
  - `public/_headers`: `/_next/static/*` cached 1 year, immutable.
  - `.dev.vars.example` (`NEXTJS_ENV=development`); `.dev.vars` is gitignored.
  - `cloudflare-env.d.ts` generated by `pnpm cf-typegen` and **committed** (typed bindings).
  - Scripts: `preview`, `deploy`, `upload`, `cf-typegen`, `typecheck` (= `next typegen && tsc --noEmit`, since route types like `LayoutProps` are generated).
- **Cache Components + Partial Prefetching turned OFF.** The Next 16.4 template enables them, but OpenNext warns they aren't fully supported on Cloudflare yet (opennextjs-cloudflare PR #1318). Re-enable both together later.
- **shadcn/ui**: `shadcn@4.23.0 init --defaults` → style `base-nova` (Base UI primitives), neutral, lucide icons, CSS variables. Added `Button`. `src/lib/utils.ts` re-exports `cn` from the **`cn`** npm package. Checked: it's shadcn's own package (github.com/shadcn-ui/cn), a faster clsx + tailwind-merge replacement.
- Placeholder home page ("Prepora — coming soon", disabled waitlist button) + real metadata. Removed the Next demo SVGs. Landing/waitlist is M0-F4.
- ESLint ignores `.open-next/`, `.wrangler/`, `cloudflare-env.d.ts`.
- `apps/web/README.md` with commands.

**CI: `.github/workflows/web.yml`**
- PR: install → lint → typecheck → `opennextjs-cloudflare build` → upload `.open-next` artifact.
- Push to `develop` / manual: download artifact → `opennextjs-cloudflare deploy` to `prepora-web-staging`. Needs `staging` environment secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Per-PR preview URLs are left for M0-I1.

**Verified**
- Windows: `pnpm lint` ✓, `pnpm typecheck` ✓, `next build` ✓.
- **Windows can't finish the OpenNext bundle:** `EPERM: operation not permitted, symlink`. OpenNext creates symlinks, which Windows only allows with **Developer Mode** (currently off) or admin/WSL. `next dev` is unaffected.
- **Linux (Docker `node:24-bookworm`, read-only copy of the repo, same as CI):** `pnpm install --frozen-lockfile` ✓ → `opennextjs-cloudflare build` ✓ → `opennextjs-cloudflare preview` (workerd) on :8787:
  - `/` → 200, correct `<title>`, page content rendered
  - CSS chunk → 200, `Cache-Control: public,max-age=31536000,immutable` (from `_headers`)
  - Tailwind + shadcn tokens present in the CSS (`--primary`, `.bg-primary`, …)
  - unknown route → 404
  - Container removed afterwards.

**Mistake fixed along the way:** a Python edit saved `layout.tsx` in Windows-1252 (the em dash broke the build with "invalid utf-8"). Re-saved as UTF-8 and checked the other edited files.

**To deploy (pick one)**
- **From this PC:** turn on Windows Developer Mode (Settings → System → For developers), then `npx wrangler login` (in `apps/web`), then `pnpm deploy:web`.
- **From CI:** push to GitHub, add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to the `staging` environment, push to `develop`.
- First deploy URL will be `https://prepora-web-staging.<your-subdomain>.workers.dev`.

**Next:** M0-F2 — design system in `packages/ui` (move shadcn there).

---

## 2026-11-21 — Cloudflare agent setup (user-level, not project code)

Followed https://developers.cloudflare.com/agent-setup/prompt.md for Claude Code.

- `claude plugin marketplace add cloudflare/skills` + `claude plugin install cloudflare@cloudflare` → plugin **cloudflare@cloudflare v1.0.4** (user scope, enabled). Adds Cloudflare skills and the Cloudflare MCP server (`https://mcp.cloudflare.com/mcp`, OAuth on first use). Run `/reload-plugins` (or restart Claude Code) to load it.
- Optional `cf` CLI (beta), installed at the user's request: checked the npm package is Cloudflare's (`wrangler-publisher`, github.com/cloudflare/cf), then `npm install -g cf` → v0.15.0.
- Created `~/.claude/CLAUDE.md` with one rule: use `cf` for Cloudflare work unless the project has a Wrangler config. **Prepora has `apps/web/wrangler.jsonc`, so Prepora keeps using Wrangler.**
- `cf auth login` completed: `cf auth whoami` shows authenticated, one Cloudflare account.
- Note: `cf` login is separate from Wrangler login. Deploying `apps/web` still needs `npx wrangler login` (or the CI API token) — see M0-F1.

---

## 2026-11-21 — M0-F1: first CI deploy, pushed to GitHub

- State found: remote `origin` = github.com/atharv0825/Prepora (private). `develop` had only the migration pipeline (PR #1 merged). The Edge Function template (`9d47dfa`) and web app (`2f4dde7`) commits existed locally only.
- User added `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to GitHub.
- Created branch `feature/m0-functions-and-web` (those two commits + log updates) and pushed it. No secret files are tracked (`.dev.vars`, `.env*`, `supabase/.temp` checked).
- Next: open PR → `develop`. The PR runs `Web` (lint/typecheck/OpenNext build) and `Edge Functions` (deno check). Merging runs `deploy-staging` for both:
  - Web → Cloudflare worker `prepora-web-staging`
  - Functions → Supabase staging (`health`)
- I can't see Actions results myself (private repo, no `gh` CLI / token here).

---

## 2026-11-21 — Fix: Edge Functions CI `deno check` failed on Deno 2

**Error (CI):** `Could not find a matching package for 'npm:@sentry/deno@11.16.0' in the node_modules directory`, plus a warning that Deno migrated `pnpm-workspace.yaml` into `package.json` (on the runner only).

**Cause:** the root `package.json` (added in M0-B4/F1) makes Deno 2 switch to "use the local node_modules" mode, so `npm:` imports are no longer fetched into Deno's own cache. My local checks used Deno 1.37, which doesn't do this, so they missed it.

**Fix**
- Added `supabase/functions/deno.json` with `"nodeModulesDir": "none"` (Deno's global cache, the same way Supabase's edge runtime resolves `npm:` imports).
- `edge-functions.yml`: `deno check` now runs with `working-directory: supabase/functions`, so Deno finds that `deno.json` instead of the root `package.json`.

**Verified**
- Docker `denoland/deno:2.5.6` on a copy of the repo: reproduced the exact CI error with the old command, and the new command passes. A deliberately broken type in `health` is reported (`TS2322`), so the check is real. Root `package.json` is left untouched.
- Redeployed `health` to staging with `supabase functions deploy --use-api` from the repo root (same as the CI deploy job): it works with the new `deno.json`. `GET` → `env: "staging"` (the `APP_ENV` secret is now set), region `ap-southeast-1` when pinned; `PUT` → 405 in the agreed error format.
- Lesson: check Deno code with Deno 2 (Docker or CI), not the local Deno 1.37.

---

## 2026-11-21 — Fix: Edge Functions CI blocked by Deno's minimum dependency age

**Error (CI, PR #2):** Deno refused `npm:@sentry/deno@11.16.0` (`_shared/deps.ts:8`): *"newer than the specified minimum dependency date … (the default is 24 hours)"*.

**Cause:** Deno 2 (CI uses the latest, 2.9.8) refuses packages published less than 24 h ago, like pnpm 12 does. I pinned Sentry's newest release, `11.16.0`, published 2026-11-20 14:00 UTC; the CI run was within 24 h of that. Without a lockfile, any fresh release of an indirect dependency could break CI the same way on a random day.

**Fix**
- `_shared/deps.ts`: `@sentry/deno` **11.16.0 → 11.14.0** (2026-11-17). zod 4.6.7 and supabase-js 2.119.2 were already old enough. Added a comment on how to upgrade safely.
- Added **`supabase/functions/deno.lock`** (generated with Deno 2.9.8), so indirect dependencies are fixed too.
- `edge-functions.yml`: `deno check --frozen`. CI now fails if the lock is out of date, instead of quietly resolving new versions.

**Verified** (Docker `denoland/deno:latest` = 2.9.8)
- The old pin reproduces the exact CI error. The new pin passes; `--frozen` with an empty Deno cache also passes.
- Every package in `deno.lock` was published ≥ 2 days ago (newest: supabase-js 2.119.2, 2026-11-19).
- Redeployed `health` to staging with the lock present: deploys and responds fine.

**Rule from now on:** when adding or upgrading a dependency (npm, pnpm or Deno), pick a version published more than 24 hours ago, and commit the lockfile.

---

## 2026-11-21 — M0-F2: Design system in `packages/ui`

**Goal (plan.md):** design system in `packages/ui`: colours, typography, buttons, inputs, cards, dialogs, toasts. Mobile-first. **Source:** `Prepora_UI_Design.md` (monochrome black and white, Inter Tight / Inter / Instrument Serif, pill buttons, 20–24px card radius, 1px borders, faint grid on the dark hero).

Branch `feature/m0-f2-design-system` (from `develop` after PR #2 was merged).

**Package `@prepora/ui`** (`packages/ui`)
- `package.json` (exports `./globals.css`, `./components/*`, `./lib/*`, `./hooks/*`; React as peer dependency), `tsconfig.json`, `components.json` (shadcn monorepo aliases → `@prepora/ui/...`), `README.md` (usage, tokens, type scale, components).
- Moved from `apps/web`: `globals.css`, `lib/utils.ts`, `components/button.tsx` (git renames). Moved the shadcn runtime deps (`@base-ui/react`, `cva`, `cn`, `lucide-react`, `shadcn`, `tw-animate-css`) from web to ui; added `sonner@2.0.8` and `tailwindcss` 4.3.3.
- `apps/web/components.json` now points `ui`/`utils` at `@prepora/ui`, so `shadcn add` (run in `apps/web`) writes into the package.

**Tokens and styles** (`src/styles/globals.css`)
- Exact palette from the design doc as `brand-*` colours (black #0A0A0A, surface #141414, line #262626, white, stone #F5F5F4, grey #A3A3A3, slate #525252), mapped onto shadcn's semantic tokens for light (`:root`) and dark (`.dark`).
- **The `dark` class works on any element**, so the page goes from a dark hero to white sections, and an `inverted` card is just a card with `dark`.
- **Decision:** `destructive` is the only non-grey colour (red, for errors/delete), always with text or an icon. The design doc says no colour accents; errors need to be recognisable. Easy to change if you want pure monochrome.
- Fonts via CSS variables; Instrument Serif italic as `text-accent-serif`.
- Radius base 16px → cards (`rounded-xl`) ≈ 22px.
- Mobile-first fluid type scale: `text-display` (40→72px), `text-h1`, `text-h2`, `text-h3`, `text-lead`, `text-eyebrow`; body Inter 16px.
- Utilities: `bg-grid` (5% lines, fades out), `glass`, `container-page`, `animate-fade-up`, `animate-drift`; all motion off with `prefers-reduced-motion`.
- Fixed a shadcn bug: `--font-sans: var(--font-sans)` referred to itself.
- `@source` covers the package's own components and `apps/*/src` (the package is symlinked under `node_modules`, which Tailwind skips by default).

**Components** (shadcn `base-nova`, restyled)
- `button`: pill; `default` / `outline` / `secondary` / `ghost` / `link` / `destructive`; sizes `sm` 36px, `default` 44px, `lg` 48px, `icon`, `icon-sm`; hover inverts (as the design doc asks); thin 1.5px icon stroke. `link` stays text-sized at any size.
- `input` (44px pill, 16px text so iOS doesn't zoom), `textarea`, `label`.
- `card`: 1px border, 24px padding, variants `default` / `inverted` / `glass` / `muted`.
- `badge`: pill; `outline` for the eyebrow and Platinum marker.
- `dialog`: **bottom sheet on phones** (safe-area aware), centred from 640px; darker scrim.
- `sonner`: removed the `next-themes` dependency (no theme switcher in this design), `theme` prop (default light), bottom-centre; `toast` re-exported so apps don't import `sonner` directly.

**Web app**
- `layout.tsx`: `next/font` Inter, Inter Tight (300–600), Instrument Serif italic; imports `@prepora/ui/globals.css`; `<Toaster />`; viewport `viewportFit: cover`, theme colour #0A0A0A.
- `next.config.ts`: `transpilePackages: ["@prepora/ui"]`.
- Added `lucide-react` (same version as ui) for icons used directly in the app.
- **`/design`** showcase page (noindex, not linked): dark hero sample (grid, eyebrow, display + serif accent, CTAs, glass stat cards), colours, typography, buttons on light and on dark, inputs incl. error and disabled, cards and badges, dialog and toast demos.
- `web.yml` CI also type-checks `@prepora/ui`. The ui package has no lint script (no ESLint set up there yet).

**Verified**
- Windows: ui typecheck ✓, web typecheck ✓, web lint ✓, `next build` ✓ (`/design` prerendered static). Compiled CSS contains the custom utilities and brand tokens.
- **Screenshots** (headless Chrome against `next start`):
  - Desktop 1440px: matches the design doc (dark hero with grid and serif "Band 8+", glass cards, pill buttons inverting correctly on dark, solid black Platinum card).
  - Phone 390px: no horizontal overflow; CTAs full width and stacked; type scales down; cards stack. (Headless Chrome on Windows can't go below a ~504px window, so the phone view was rendered in a 390px iframe.)
- **Linux (Docker, same steps as CI):** frozen install ✓, lint + both typechecks ✓, OpenNext build ✓, workerd preview: `/` 200, `/design` 200 with `noindex`.

**Not done / next**
- Navbar, footer and 404/500 pages are M0-F3; the real landing page is M0-F4 (it reuses these pieces).
- More components (select, tabs, progress…) get added when a feature needs them.

---

## 2026-11-21 — M0-F2 follow-up: font changed to Hanken Grotesk

User asked for **Hanken Grotesk** (shared as Google Fonts `<link>` / `@import` tags).

- Loaded with `next/font/google` (`Hanken_Grotesk`, variable 100–900, normal + italic, `display: swap`) instead of the `<link>` tags. Same font, but self-hosted at build time: no request to Google when the page loads (privacy, speed on mobile networks), and no layout shift (Next adds a size-matched fallback).
- Used for **headings and body**; replaces Inter and Inter Tight. **Instrument Serif italic stays** for the single accent phrase ("Band 8+").
- Changed: `apps/web/src/app/layout.tsx`, `packages/ui/src/styles/globals.css` (`--font-sans` and `--font-heading` → `--font-hanken-grotesk`), `/design` labels, `packages/ui/README.md`, and the Fonts section of `Prepora_UI_Design.md`.
- Verified: typecheck ✓, lint ✓, `next build` ✓; compiled CSS uses `Hanken Grotesk` + fallback; font files are served from `/_next/static/media`; the page HTML has no `fonts.googleapis.com` / `fonts.gstatic.com` references. Screenshot at 1440px: renders well with the existing type scale and tight heading tracking, no adjustments needed.

---

## 2026-11-21 — M0-F3: App shell + Supabase client

**Goal (plan.md):** header, nav, footer with version, 404/500 pages, Supabase client setup.

Branch `feature/m0-f3-app-shell`, **based on `feature/m0-f2-design-system`** (F2's PR not merged yet). Merge F2 first; then this PR's diff shows only F3.

**Shared contract package `@prepora/shared`** (`packages/shared`)
- `package.json` (exports `./db`, `./api/*`, `./constants/*`, `./ielts/*`), `tsconfig.json`.
- `src/db.ts` (generated in M0-B4) is now importable as `@prepora/shared/db`.
- `src/api/regions.ts`: `PINNED_FUNCTION_REGION = "ap-southeast-1"` (matches the Edge Functions).
- `src/api/errors.ts`: `ApiErrorBody` / `ApiErrorCode` + `isApiErrorBody()`, the `{ error: { code, message } }` contract.
- `src/api/health.ts`: `HealthResponse` type.

**Supabase client** (`apps/web/src/lib/supabase/`)
- Packages: `@supabase/ssr@0.12.7`, `@supabase/supabase-js@2.119.2` (same as the Edge Functions), `server-only`. All past the 24 h age rule.
- `env.ts`: reads `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; throws a clear `SupabaseConfigError` if missing.
- `client.ts`: browser client (one per tab), typed with `Database`.
- `server.ts`: per-request server client using Next 16's async `cookies()`; marked `server-only`.
- `functions.ts`: `invokeFunction()` always pins `ap-southeast-1` and turns failures into the shared error shape; `getHealth()`.
- Uses the project's new **publishable key** (`sb_publishable_…`) instead of the legacy anon JWT.
- `apps/web/.env.example` (committed; `.gitignore` now allows it). `apps/web/.env.local` (gitignored) has the staging URL + publishable key; the secret keys were never printed or written.
- Session refresh in `proxy.ts` (Next 16's new name for middleware) is **M1-F2**, not done here.

**Edge Function tweak:** `_shared/auth.ts` treats a `sb_publishable_…` bearer token as anonymous. The deployed function already behaves this way (Supabase's gateway swaps the publishable key for the anon JWT), but local `supabase functions serve` may not. Ships with the next functions deploy. Deno 2 check (`--frozen`) ✓.

**Shell** (`apps/web/src/components/layout/`, `src/lib/routes.ts`)
- `routes.ts`: every link in one place; links to pages that don't exist yet are marked with their milestone (landing anchors M0-F4, login/signup M1, legal pages M11). Until then they show the 404 page.
- `site-header.tsx`: **solid black** sticky navbar (design doc §1): logo, desktop nav (grey links; the active one white with a short 2px underline), "Log in" text link, "Start free" white pill. A translucent version was tried first; it looked grey over white sections, so it's solid.
- `logo.tsx`: "P" monogram in a white **square** (7px radius; the token radius made it a circle) + wordmark.
- `nav-links.tsx` (client, `usePathname`), `mobile-nav.tsx` (client): below `md`, a menu button opens a **dark bottom sheet** (our Dialog) with large links + full-width "Start free" / "Log in".
- `site-footer.tsx`: black; Product / Company / Legal columns incl. **Privacy, Terms, Delete account**, plus a Status link; bottom row "© 2026 Prepora" and **`v0.1.0 · <commit>`**.
- **Version:** `next.config.ts` sets `NEXT_PUBLIC_APP_VERSION` (from `apps/web/package.json`) and `NEXT_PUBLIC_COMMIT_SHA` (`GITHUB_SHA` in CI, otherwise `git rev-parse`) at build time.
- Root layout: "Skip to content" link (visible on keyboard focus) → `#main`.

**Routes**
- `(marketing)` route group with a layout that adds the header and footer. Home (`/`) and `/design` moved into it (git renames); their own `<main>` became a plain wrapper, so there's no nested `<main>`. The signed-in `(app)` area can get its own shell later.
- `not-found.tsx` (404): dark grid section, "This page *isn't* here.", Home / Contact. Renders the header and footer itself (it's outside the route group).
- `error.tsx` (500): Next 16 API `{ error: unknown, retry }`; "Something went wrong.", Try again (`retry()`) / Home, shows the error digest as a reference. Sentry capture comes in M0-I2.
- `global-error.tsx`: last resort if the root layout fails; own `<html>`/`<body>`, imports the global CSS, no fonts or shell.
- **`/status`** (dynamic, noindex): calls the `health` Edge Function server-side via the pinned client, shows environment, region, latency, and the web version. **This is the M0 exit criterion "web app calls health".**
- `transpilePackages`: `@prepora/ui`, `@prepora/shared`.

**CI (`web.yml`)**
- Build gets `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from **repository variables** (`vars.*`, not secrets; they're public). Missing → build still works, `/status` says "not configured".
- Also type-checks `@prepora/shared`.

**Verified**
- Windows: lint ✓, typecheck (web, ui, shared) ✓, `next build` ✓.
- `next start` + headless Chrome:
  - Desktop: header (Home underlined), status card **Operational, staging, ap-southeast-1**, 404, 500 (via a temporary throwing route, **deleted afterwards**, with a reference digest), footer `v0.1.0 · 5c417f1`.
  - Phone (real 390×844 emulation via a small Chrome DevTools script): solid header with square monogram + menu button; **tapping the menu opens the bottom sheet**; 404 stacks full width; `scrollWidth == 390` on every page (no horizontal overflow).
  - First phone run showed unstyled pages: an old `next start` from the previous build was still holding port 3100 and serving stale asset names. Killed it and rebuilt; it was a test setup problem, not an app bug.
- Linux (Docker, same steps as CI, `GITHUB_SHA` faked): frozen install, lint, 3 typechecks, OpenNext build ✓. In the workerd preview: `/` 200, `/status` 200 → **Operational / staging / ap-southeast-1 / 117 ms (Worker → Supabase)**, `/design` 200, unknown URL 404; footer shows `commit abcdef1` from `GITHUB_SHA`.
- Deno 2 (`denoland/deno:latest`): `deno check --frozen` ✓ after the auth change.
- One Docker Desktop hiccup (engine API 500) killed the first container; reran cleanly.

**Manual step for you**
- GitHub → Settings → Secrets and variables → Actions → **Variables** tab → add repository variables:
  - `NEXT_PUBLIC_SUPABASE_URL` = `https://xvaxqiumdmgdvmbsqcub.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the staging **publishable** key (Supabase dashboard → Project Settings → API Keys; starts with `sb_publishable_`)

---

## 2026-11-21 — Fix: DB migrations CI failed pulling Supabase images (registry quota)

**Error (CI, `DB migrations` → validate, on the F3 PR because it touched `supabase/`):** pulling `public.ecr.aws/supabase/postgres-meta:v0.98.0` failed with **"Data limit exceeded"**, and Docker exited with 125. Other images hit the same limit but the CLI quietly retried them from GHCR; for postgres-meta (used by `supabase gen types` in the types check) it didn't.

**Cause:** the Supabase CLI pulls its local images anonymously from AWS's public registry by default, and that registry's anonymous quota ran out for the runner.

**Fix:** `db-migrations.yml` sets `SUPABASE_INTERNAL_IMAGE_REGISTRY: ghcr.io` for the whole workflow, so every Supabase image comes from GitHub's registry from the start. Checked first that CLI 2.116.0 reads this variable (its default is `public.ecr.aws`).

**Verified locally:** `supabase stop` → `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io supabase db start` freshly pulled `ghcr.io/supabase/postgres:17.6.1.165` and `ghcr.io/supabase/postgres-meta:v0.98.0`; migrations applied; `node scripts/gen-db-types.mjs --check` passes. Only the `prepora` stack was restarted; the separate `Backend` stack wasn't touched.

No other workflow pulls Supabase images.

---

## 2026-11-21 — Fix: first Cloudflare deploy failed (token access) + env warning

**Error (CI, `Web` → deploy-staging, after PR #3 was merged into `develop`):** `wrangler deploy` failed on `GET …/workers/scripts/prepora-web-staging/secrets` with **"No access to the specified resource"**. There was also a warning: multiple environments defined but no target given.

**Investigation**
- The secrets call comes from `wrangler deploy` itself (it reads existing secrets to check for clashes with `vars`), not from OpenNext; checked OpenNext's `deploy` source.
- `cf workers list` → **no Workers in the account yet**, so this was the very first deploy. A correctly scoped token handles a new Worker fine, so the token/account pair is the suspect.
- The token policy the user shared (`prepora-github-staging`, no secret value) resolves via Cloudflare's permission-group list to: Workers Scripts Write, Workers Editor, Account Settings Read, Workers R2 Storage Write, Workers KV Storage Read, scoped to account `03f20aa15b1e662f5471f23c96a271c0`. **Same account the `cf` login sees, and enough to deploy.**
- So the most likely cause: the value stored in GitHub isn't this token (an old/other token, the token ID instead of its value, extra whitespace, or a secret in a different environment/name). Couldn't confirm: the `cf` OAuth login isn't allowed to list API tokens (9109).

**Fix (branch `fix/web-deploy-cloudflare`, from `develop`)**
- `wrangler.jsonc`: explicit `env.staging` (`prepora-web-staging`, own self-reference binding, `APP_ENV=staging`). The top level still mirrors staging, so a deploy without `--env` can't reach production.
- `web.yml`:
  - Deploy is now `opennextjs-cloudflare deploy --env staging` (OpenNext passes `--env` through to Wrangler).
  - New **"Check Cloudflare credentials"** step before deploying. It fails fast with a readable reason, never printing the token:
    - secrets empty → says so
    - account ID not 32 hex characters → says so
    - token can't list this account's Workers (exactly what deploy needs) → prints Cloudflare's error code + how to fix it.
    - Doesn't gate on `/user/tokens/verify`, because account-owned tokens fail that even when valid.
- Root `deploy:web` script → `… run deploy --env staging`.

**Verified**
- Preflight script (extracted from the workflow) run in `ubuntu:24.04`: empty secrets → clear error; email as account ID → clear error; bogus token + real account ID → prints `[9106] Authentication failed` + fix hint. All exit 1.
  - The first run of this test silently passed because Windows Python couldn't write the "→" character and produced an empty script; re-extracted as UTF-8 and reran.
- Linux Docker: OpenNext build ✓; `wrangler deploy --dry-run --env staging` → `prepora-web-staging`, `APP_ENV=staging`, **no multiple-environments warning**, 1.26 MB gzipped (under the free plan's 3 MB); `--env production` → `prepora-web`.

**Manual steps for you**
1. Cloudflare dashboard → My Profile → API Tokens → `prepora-github-staging` → **Roll** (generates a new value) → copy it.
2. GitHub → Settings → Environments → **staging** → secret `CLOUDFLARE_API_TOKEN` → paste the value (no spaces or newline).
3. Same place: `CLOUDFLARE_ACCOUNT_ID` = `03f20aa15b1e662f5471f23c96a271c0`.
4. Merge this branch → the new check step tells you right away if anything is still wrong.

---

## 2026-11-21 — Staging on `staging.prepora.site` (fix: no workers.dev subdomain)

**Error (CI, after PR #4):** the credentials check passed, then `wrangler deploy` failed: the account has **no `workers.dev` subdomain** registered and the Worker had **no route**, so it had no address.

**Domain:** user connected **prepora.site** to Cloudflare. Checked with `cf`: zone `prepora.site` is **active**, Free plan, same account (`03f20aa…`). DNS has only `www` (CNAME → apex), `_domainconnect`, `_dmarc` and NS entries, so **`staging.prepora.site` is free** (a custom domain can't be created over an existing CNAME). The NS rows pointing at GoDaddy are imported leftovers; the zone is active, so Cloudflare serves the domain.

**Fix (branch `fix/web-staging-domain`, from `develop` after PR #4)**
- `wrangler.jsonc`:
  - Top level: `workers_dev: false`, `preview_urls: false`; **no routes at top level**. `routes` is *inherited* by environments (Cloudflare docs), so a top-level route would also apply to production.
  - `env.staging.routes`: `staging.prepora.site` as a **custom domain**. Cloudflare creates the DNS record and certificate on deploy.
  - `env.production`: deliberately **no route** until public launch (M13), so a production deploy fails instead of publishing `prepora.site` early. A deploy without `--env` also has no address and fails, which is intended.
- `web.yml` credentials check: also verifies the token can see zone `prepora.site` (`CF_ZONE_NAME`). If not → error naming the permissions to add.

**Token permissions:** the current token has account-level permissions only. Cloudflare's custom-domain docs don't list the required token permissions; Wrangler has to look up the zone, so the check expects **Zone → Zone → Read** and **Zone → Workers Routes → Edit** on `prepora.site`. These are part of Cloudflare's standard "Edit Cloudflare Workers" template.

**Verified**
- Preflight with stubbed Cloudflare responses (ubuntu container): Workers OK + zone missing → clear error, exit 1; both OK → exit 0.
- Linux Docker: OpenNext build ✓; `wrangler deploy --dry-run` for `--env staging` and `--env production` → valid, no warnings.

**Manual step for you:** Cloudflare → My Profile → API Tokens → `prepora-github-staging` → Edit → add permissions **Zone → Zone → Read** and **Zone → Workers Routes → Edit**; Zone Resources: Include → Specific zone → `prepora.site` → Save. (Editing keeps the same token value, so no GitHub change.) Then merge this PR.

---

## 2026-11-21 — M0-F4: Landing page + waitlist

**Goal (plan.md):** landing page + waitlist form (writes to a temporary waitlist table), to start collecting beta users now.

Branch `feature/m0-f4-landing-waitlist` (from `develop` after PR #5).

**Staging check first:** https://staging.prepora.site is **live** (PR #5 worked). `/status` shows **not_configured**: the GitHub repository variables `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (from M0-F3) aren't set. **The waitlist form on staging needs them too.**

**Database** (`supabase/migrations/20261121155123_waitlist.sql`)
- `public.waitlist`: `email` (unique, stored lowercase, format and length checks), `country_code` (ISO-2 or null), `source` (≤ 64 chars), `created_at`, `invited_at`. Index on (country_code, created_at).
- **No API access to the table:** RLS on, no policies, privileges revoked from `anon`/`authenticated`. Admins read it with the service role.
- **`public.join_waitlist(p_email, p_country_code, p_source)`**: `SECURITY DEFINER`, empty `search_path`; trims and lowercases the email, rejects bad emails (`22023`), stores Cloudflare's `XX`/`T1` as null, `ON CONFLICT DO NOTHING`, so duplicates are silent and the endpoint can't reveal who signed up. Execute granted to `anon`, `authenticated` only.
- **pgTAP tests** `supabase/tests/database/waitlist.test.sql` (12): RLS on; anon can execute the function; anon **cannot select** or **insert directly** (42501); joining works; repeat with other case/spaces doesn't fail and is stored once; invalid email rejected; T1 → null; first sign-up's country/source kept. **12/12 pass.**
- CI (`db-migrations.yml`): added `supabase test db` after lint.
- `supabase db lint` clean. Types regenerated (`waitlist`, `join_waitlist`) in both `db.ts` copies; `--check` passes.

**Shared contract:** `packages/shared/src/api/waitlist.ts`: Zod `WaitlistInput` (same email rule as the DB) + `WaitlistResult`. `zod@4.6.7` added to shared and web (same version as the Edge Functions).

**Waitlist form** (`apps/web/src/components/waitlist/`)
- `actions.ts` (server action, runs on the Worker): honeypot check → Zod → `cf-ipcountry` header → `supabase.rpc("join_waitlist")` with the publishable key. Valid emails always get "success" (including duplicates); DB errors → generic message, logged.
- `waitlist-form.tsx` (client, `useActionState`): pill input + "Join the waitlist" button; pending spinner; inline error with `aria-invalid`/`aria-live`; success replaces the form with "You're on the list." Source = `utm:<utm_source>` if present, else `hero` / `final_cta` (read at submit time). Hidden honeypot field `company`. Microcopy: "Free during beta. We only email you about early access."

**Landing page** (`(marketing)/page.tsx`, sections in `components/landing/`), following `Prepora_UI_Design.md`:
- **Hero** (dark, grid, 55/45): eyebrow, display headline with serif "Band 8+", subtext, **waitlist form in the hero** (instead of two buttons, for conversion on phones), "See how it works" link, beta-countries line; **HTML/CSS phone mockup** of the Speaking Part 2 cue card with waveform and record button; 3 floating glass stat cards (float around the phone from 1280px, row below it on smaller screens).
- **Feature strip**: white panel overlapping the hero, 4 features, AI Speaking Examiner as the solid black card.
- **Modules** (`#modules`): 2×2 cards with mini CSS previews (waveform, essay editor, reading split view, audio player).
- **How it works** (`#how-it-works`): 3 numbered steps.
- **Sample feedback**: overall 6.5, four criteria bars (they average 6.5), three corrections; labelled "Sample feedback".
- **Pricing** (`#pricing`): Free / Gold / **Platinum (solid black, "Most popular")** with credits and allowances from plan §2.5 and India prices from §2.7, plus a note that other countries get local prices at launch. Buttons go to the waitlist.
- **Final CTA** (`#waitlist`, `#contact`): black band, "Your target band is *closer* than you think.", second form.
- `Reveal` component: sections fade up on scroll. Content is visible without JS (only hidden once JS runs and the element is below the fold); instant with reduced motion.
- Page metadata (title, description, Open Graph). Smooth anchor scrolling (off with reduced motion). The page is still **static** (prerendered).
- **`waitlistMode = true`** in `routes.ts`: header and mobile menu show "Join waitlist" (→ `/#waitlist`) and hide "Log in" until accounts exist (M1 sets it to false). Avoids 404s from the main CTA.

**Deliberate deviations from the design doc**
- **No invented numbers or testimonials.** "Rated by 10,000+ learners", "+1.0 avg band", "500+ mock tests", "20,000+ sessions" and testimonials would be false before launch. Replaced with product facts (4 modules, 4/4 criteria, 1:00 prep timer) and a beta-countries line. Add real social proof after the beta.
- Hero CTA is the email form itself (the doc's "Start practising free" button has nothing to link to yet).
- Pricing shows three plans (the doc shows Free + Platinum) so Gold's price is visible too.

**Verified**
- Windows: lint ✓ (fixed two "setState in effect" errors by reading the UTM at submit time and toggling classes in `Reveal`), typecheck web/ui/shared ✓, `next build` ✓.
- **End to end against a local Supabase** (gateway + REST + auth + DB, images from ghcr), real Chrome via DevTools:
  1. hero, `?utm_source=telegram`, `Asha.Rao@Example.com` → stored `asha.rao@example.com`, source `utm:telegram`
  2. final CTA, same email lowercased → no second row
  3. `not-an-email` → "Enter a valid email address."
  4. honeypot filled → nothing stored
  5. final CTA, new email → stored, source `final_cta`
  6. success UI → "You're on the list. We'll email you when your free beta invite is ready."
  - Country is null locally (no Cloudflare header), as expected.
- Screenshots: desktop 1440 full page, phone 390×844 full page (no horizontal overflow), hero at 1440/1280/1024 after moving the stat cards off the mockup's text.
- Deno 2 `deno check --frozen` ✓ (functions' `db.ts` changed).
- Linux Docker, **without** the Supabase env vars (like CI today): frozen install, OpenNext build ✓, `wrangler deploy --dry-run --env staging` ✓, 1.34 MB gzipped.

**Local state:** the local Supabase stack (prepora) is running with gateway/REST/auth; stop with `supabase stop`. The test rows exist only in the local DB.

**Manual steps for you**
1. **GitHub → Settings → Secrets and variables → Actions → Variables** → add `NEXT_PUBLIC_SUPABASE_URL` = `https://xvaxqiumdmgdvmbsqcub.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the staging `sb_publishable_…` key. **Without these the staging form shows "Something went wrong".**
2. Merge the PR → CI pushes the `waitlist` migration to staging, runs the DB tests, and deploys the site.
3. Then try the form on https://staging.prepora.site and check the row in Supabase (Table Editor → `waitlist`).

---

## 2026-11-21 — Staging built without Supabase variables (F4 live, /status "not_configured")

- PR #6 (F4) was merged at 23:10. Staging serves commit `1a11818` with the new landing page ("Join waitlist" header), but `/status` shows **not_configured: missing NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY**, so the waitlist form can't reach Supabase.
- Cause: these `NEXT_PUBLIC_*` values are baked in at build time from **repository variables** (`vars.*`). Either they weren't set when the build ran, or they were added somewhere the build job can't see (Secrets, or variables inside the `staging` *environment*; the build job isn't attached to an environment).
- The user also asked about pushing real values in `apps/web/.env.example`. Advised against it (it's only a template; nothing reads it; the publishable key is public, so not a leak). The user restored it.
- **Fix (branch `fix/web-require-supabase-vars`):** `web.yml` → new step "Check Supabase build variables" before lint. Deploy builds (push / manual) **fail** with a message naming the missing variables and exactly where to add them; PR builds only **warn**. Deliberately not attaching the build job to the `staging` environment, because branch rules on that environment could block PR builds.
- Verified the step's logic in 4 cases: PR + missing → warning, exit 0; push + both missing → error, exit 1; push + one missing → error naming it, exit 1; push + both set → exit 0.
- **To get the form working now:** add the two repository variables, then GitHub → Actions → "Web" → latest run on `develop` → **Re-run all jobs** (re-runs see the current variable values), or merge this fix PR (that triggers a fresh deploy).

---

## 2026-11-21 — Design doc: green and purple accent colours

User asked to allow **light green, dark green and purple**, with the large italic text coloured green and purple. Edited `Prepora_UI_Design.md` only (code not changed yet).

- Base stays black/white/grey. New **accent palette**, chosen by WCAG contrast (large text needs ≥ 3 : 1):
  - on dark: `accent-green-light #86EFAC` (14.1 : 1 on #0A0A0A), `accent-purple-light #C4B5FD` (10.7 : 1)
  - on light: `accent-green-dark #166534` (7.1 : 1 on #FFFFFF), `accent-purple-dark #6D28D9` (7.1 : 1)
  - The light shades fail on white (~1.4 : 1) and the dark shades are weak on black (~2.8 : 1), so the doc says which shade goes on which background.
- **Large italic serif phrases** (*Band 8+*, *closer*, *isn't*): **green → purple gradient** across the phrase (light shades on dark, dark shades on light); a solid green or purple is allowed for very short words.
- Other allowed small uses: eyebrow dot (light green), status dots, Platinum badge outline (purple).
- Never coloured: buttons, backgrounds, cards, body text, borders, icons.
- Updated in the doc: intro, Look, palette (new accent table + rules), Fonts, hero "Band 8+", eyebrow dot, final CTA headline, mobile Platinum badge.
- Next: implement in `packages/ui` (`brand-accent-*` tokens, `text-accent-serif` gets the gradient, eyebrow dot) after the user confirms.

---

## 2026-11-22 — Green/purple accents implemented + frosted-glass header

Branch `feature/ui-green-purple-accents` (from `develop` after PR #7). Includes the design-doc edit from the previous entry.

**Accents** (`packages/ui/src/styles/globals.css`)
- Raw colours: `brand-green-light #86EFAC`, `brand-purple-light #C4B5FD`, `brand-green-dark #166534`, `brand-purple-dark #6D28D9`.
- Semantic `accent-green` / `accent-purple` (`--accent-*`): dark shades in `:root` (light sections), light shades in `.dark`. So `bg-accent-green`, `border-accent-purple` etc. pick the right shade automatically.
- `text-accent-serif` (all big italic serif phrases: *Band 8+*, *closer*, *isn't*): **green → purple gradient** via `background-clip: text`, inside `@supports` (falls back to solid green, never invisible text); small right padding so the italic overhang isn't clipped; `box-decoration-break: clone` for wrapped lines.
- Applied only where the doc allows: hero eyebrow dot + beta-countries dot (green), phone-mockup "Recording…" dot (pulsing green), Speaking module preview dot, Platinum "Most popular" badge outline (purple) on the landing page and `/design`.
- `/design`: new "Accents" section (4 swatches + "Reach *Band 8+*" on light and on dark).
- `packages/ui/README.md`: accent tokens and usage rules.

**Header** (user: "should be a bit white and transparent")
- `site-header.tsx`: frosted glass: `rgb(28 28 28 / 0.8)`, `backdrop-blur-xl backdrop-saturate-150`, `border-white/10`, faint inset top highlight.
- Contrast checked: at 70% the grey nav links fell to 2.5:1 over white sections, so: 80% opacity, and inactive links are white/75 instead of grey. Result: over white sections white text 9.0:1, links 6.0:1; over the hero 17.8:1 / 10.3:1.
- Design doc §1 updated (glass surface, link colour).

**Gotcha found:** the first local build served **stale CSS** (the old `text-accent-serif`, no `--accent-*` at all) although the source was correct. Turbopack's cache didn't notice the change to a CSS file in the workspace package. `rm -rf apps/web/.next` + rebuild fixed it. CI always builds fresh, so it isn't affected. Saved as a memory note.

**Verified** (clean build, `next start`, Chrome via DevTools)
- Computed style of the hero phrase: `linear-gradient(90deg, rgb(134,239,172), rgb(196,181,253))` (light shades on dark).
- Screenshots: hero (glass header, gradient *Band 8+*, green dot), header scrolled over white sections (readable), pricing (purple badge outline), final CTA (gradient *closer*), `/design` accents (dark-green→dark-purple on light, light shades on dark), phone 390px hero.
- lint ✓, typecheck web + ui ✓, `next build` ✓.

---

## 2026-11-22 — Header: transparent at the top, adapts to the section behind it

User feedback (screenshots): the glass header showed as a **grey bar** while scrolling the hero and looked bad over **white** sections; asked for it to be **transparent from the start of the page** and more transparent overall.

**Change** (`apps/web/src/components/layout/site-header.tsx`, now a client component)
- Overlays the page: `sticky top-0 -mb-16`, so the first section runs underneath it.
- On scroll/resize (batched with `requestAnimationFrame`, passive listeners) it checks what's under the middle of the bar (`elementsFromPoint`, ignoring the header itself) and whether that sits inside a `.dark` section:
  - **top (scrollY ≤ 8):** fully transparent, no border, no blur;
  - **scrolled + dark behind:** `rgb(10 10 10 / 0.35)` + `backdrop-blur-xl`, `border-white/10`;
  - **scrolled + light behind:** `bg-white/65` + blur, `border-black/5`, and the `dark` class is removed, so text, logo square and button turn dark via the tokens.
  - `transition` on background/border for a smooth switch. `data-tone` attribute shows the current state.
- First sections got +4rem top padding: hero (`pt-28 sm:pt-36`), `/status`, `/design` hero, 404, error page.
- Design doc §1 updated (three header states; inactive links = text colour at 75%).

**Verified** (clean build, viewport screenshots at real scroll positions via a new DevTools script)
- Desktop 1440: y=0 transparent (hero grid visible under the menu); y=420 (in hero) `rgba(10,10,10,0.35)` + blur, no grey band; y=900 and 2600 (white sections) white glass with black text/button; y=4276 (final CTA) dark glass.
- Phone 390: top transparent; scrolled, follows the section behind it.
- `/status` (starts on white): light tone at the top, dark text. 404 (starts dark): transparent, white text.
- lint ✓, typecheck ✓, build ✓.

---

## 2026-11-22 — Hero: live device showcase (phone ⇄ laptop) + flowing accent grid

User request: the hero phone should be a **live, working component**, first the phone, then **transition to a laptop**; show live demos for **Speaking, Writing, Listening and Reading**; the grid lines/squares in the background should **flow in the green/purple accents**.

**Showcase** (`apps/web/src/components/landing/showcase/`)
- `hero-showcase.tsx` (client): one timer (100 ms tick) drives `{ index, t }` in a **single state object** (the first version changed the index inside another state's updater, which React may run twice in Strict Mode → skipped scenes; fixed before shipping).
  - Order: Speaking (phone) → Writing (laptop) → Reading (laptop) → Listening (phone) → loop, 7.5 s each (`SCENE_MS`).
  - Device frame **morphs** (width/height/radius transitions, 700 ms); the notch shrinks to a camera dot; the laptop base slides in; scenes cross-fade.
  - **Laptop content is laid out at a fixed 520×292 and scaled to fit** (ResizeObserver), and the frame height follows the scale. The first version squeezed the laptop at 390 px (Writing text cut off, score panel a sliver).
  - Tabs (`role=tablist`) to jump to a demo, thin green progress line on the active tab; a screen-reader live region announces the current demo.
  - Pauses on hover/focus, when out of view (IntersectionObserver) or `document.hidden`. **Reduced motion:** no auto-advance; the selected scene shows its finished state.
- Scenes (pure functions of `t` in ms): `speaking-scene` (timer, animated waveform, ping on mic, then band card 7.0 + FC/LR/GRA/P), `writing-scene` (typing essay with blinking caret, word count, countdown, then score panel 6.5 + criteria bars), `reading-scene` (green highlight sweeps the passage, T/F/NG answers picked at 1.6/3.2/4.8 s, "3 / 3 correct"), `listening-scene` (audio progress, 4 form answers typed in). Helpers in `shared.ts`.
- `phone-mockup.tsx` removed (replaced by the showcase).
- Stat cards: now a 3-column row of glass cards under the device (floating around a laptop would cover its screen).

**Background** (`hero-background.tsx`, replaces the plain grid in the hero)
- Grid kept (56 px); **light streaks flow along grid lines**: green (#86EFAC) along rows, purple (#C4B5FD) down columns, varied speeds/delays; **7 grid squares glow** green/purple (tinted fill + coloured 1 px edge + soft glow; a faint fill alone looked grey). Same bottom fade mask as the grid. Fixed positions (no `Math.random`), so server and client match.
- Uses literal hex values: Tailwind only emits theme variables that some class uses, so `var(--color-brand-purple-light)` might not exist (purple wasn't used by any class). The Reading highlight was switched to a literal too.
- New keyframes in `packages/ui` globals: `beam-x`, `beam-y`, `cell-glow`, `wave-bar`, `caret-blink` (plain `@keyframes`, always emitted; stopped by the reduced-motion rule).

**Verified** (clean builds; Chrome via DevTools, frames captured over time)
- Desktop 1440: 1.5 s Speaking recording → 6.5 s scoring → 10 s laptop Writing typing → 14 s Writing scored → 18.5 s Reading answers → 27 s phone Listening; the active tab matches at each frame; no console errors. Glowing squares now read green/purple; streaks visible.
- Laptop scenes at 390 px (phone), 1024 px and 1440 px: identical layout, nothing clipped.
- Phone 390 (tall viewport): all four scenes play; no horizontal overflow.
- Reduced motion (emulated): stays on Speaking at 3 s and 10 s, finished state shown, no streaks.
- Home page still static (prerendered). lint ✓, typecheck ✓, build ✓.
- Design doc §2 updated (Right side: live showcase; new Background subsection).
