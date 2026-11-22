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

---

## 2026-11-22 — White page, light-green components, new teal/green palette

User request: hero background **white** with a **light-grey flowing grid** (instead of black); components that were **black become light green**; adopt the palette `#08222B #0F3B47 #1C5F66 #37918A #68C1A7 #A7E6C9 #EAFAF0`, **primary `#3FC48C`**, plus `#8C3F3F`; update the design doc.

**Tokens** (`packages/ui/src/styles/globals.css`)
- New brand colours: `brand-ink #08222B`, `brand-deep #0F3B47`, `brand-teal #1C5F66`, `brand-sea #37918A`, `brand-mint #68C1A7`, `brand-mist #A7E6C9`, `brand-foam #EAFAF0`, `brand-primary #3FC48C`, `brand-rust #8C3F3F`. Green/purple accent tokens removed; old neutrals (`brand-black` …) kept.
- Light scheme: text `#08222B`, **primary buttons `#3FC48C` with `#08222B` text** (7.5 : 1; white text on that green is 2.2 : 1), ring `#37918A`, destructive `#8C3F3F` (interpretation: the user didn't say what `#8C3F3F` was for; it's used for errors only).
- New **`mint` scheme class** (replaces `dark` on the website): `#EAFAF0` background, `#A7E6C9` borders, `#1C5F66` muted text, white cards. `dark` kept, retuned to deep teal, for the mobile app's dark mode.
- Serif accent gradient: `#1C5F66 → #37918A` (accent-green / new accent-teal). `#3FC48C` is too light for text on white.
- `bg-grid`: light-grey lines `#E7EAEA`. `glass`: light green `#EAFAF0` @ 75%, `#A7E6C9` border, ink text.

**Components**
- Hero: `dark` removed (white). `hero-background.tsx`: streaks `#3FC48C` (rows) / `#37918A` (columns), squares glow mist/mint.
- `mint` instead of `dark`/black: feature-strip highlighted column, `Card variant="inverted"` (Platinum), final CTA, footer. "Most popular" badge: green outline + faint fill.
- Showcase scenes: white cards, teal secondary text, green mic button / progress / answers, `#3FC48C` reading highlight.
- Sample-feedback bars + correction chips and module-preview bars/play button: green instead of ink.
- 404, error, global-error, mobile menu: no longer dark. Header default tone `light`. `themeColor` `#ffffff`.
- `/design` reference page: new palette + "on mint" samples.
- Design doc: palette table, usage rules, every section's colours rewritten.

**Verified:** typecheck ✓, lint ✓. Full-page headless Chrome screenshot of the user's dev server (:3000): hero, showcase, stat cards, feature strip, modules, feedback look right. Pricing / final CTA / footer were not captured (scroll-reveal hadn't run) — not visually checked.

---

## 2026-11-22 — Black device body, logo PNG, green wordmark, nav selection

User request: laptop/phone **should be black**; **reduce hero top margin**; use the supplied **PNG as the logo**; **"Prepora" text not black**; nav links (Home, Modules, How it works…) **should show the selection**.

- `hero-showcase.tsx`: frame `bg-brand-black` + `border-brand-line`, black notch, `#141414` laptop base. Screen stays light green (`#EAFAF0`).
- `hero.tsx`: top padding `pt-28 sm:pt-36` → `pt-20 sm:pt-24`.
- Logo: user's PNG resized to 256 px → `apps/web/public/logo.png`; `logo.tsx` renders it (`next/image`, 32 px) + wordmark in **`brand-logo #0FA467`** (sampled from the PNG; new token; 3.2 : 1, OK for large text).
- New `apps/web/src/hooks/use-nav-active.ts` (scroll-spy): on `/` the active link follows the section under the header (Home at the top; Modules / How it works / Pricing / Contact as each section passes 120 px; Contact at page bottom); clicking a link scrolls there so it becomes active. Other pages: by pathname. Used by `nav-links.tsx` and `mobile-nav.tsx`. Removed `src/hooks/.gitkeep`.
- Active style: light-green `#EAFAF0` pill, medium weight, short `#3FC48C` underline; inactive hover gets the pill.
- Design doc §1/§2 and overall-style updated.

**Verified:** typecheck ✓, lint ✓. Headless screenshot of the top of `/`: black phone, green logo + wordmark, Home selected, smaller top gap. **Not verified:** scroll-spy switching (headless screenshots of `/#how-it-works` came out blank) — user to check by clicking/scrolling. The dev server on :3000 stopped responding after `.next` was cleared; needs a restart.

---

## 2026-11-22 — Serif accent in #8C3F3F, hero headline lifted 1.5 grid cells

User request: the **big italic text** should be **`#8C3F3F`**; the hero headline block's top margin should be **reduced by 1.5 background grid squares**.

- `globals.css` `text-accent-serif`: gradient removed; solid `#8C3F3F` (7.2 : 1 on white, 6.5 : 1 on `#EAFAF0`). Applies to *Band 8+* and the final CTA's *closer*.
- `hero.tsx`: left column gets `lg:-translate-y-21` (84 px = 1.5 × 56 px cells). Done with `translate` rather than padding because the hero top padding (96 px on desktop) can't shrink by 84 px without the text going under the 64 px header, and the column is vertically centred against the showcase. `translate` is a separate CSS property from the fade-up `transform`, so they don't clash. Desktop (≥ 1024 px) only; on phones the single-column layout is unchanged.
- Design doc: palette row for `brand-rust` and every "gradient" mention updated; hero position note added.

**Verified:** typecheck ✓, lint ✓. Headless Chrome screenshot of `/` at 1530×740: *Band 8+* renders in `#8C3F3F`; eyebrow moved from ~205 px to ~135 px from the top, headline starts higher.

---

## 2026-11-22 — Hero trimmed: no eyebrow, beta line, demo tabs or stat cards

User request: the user had already deleted the **"Your AI IELTS Coach"** eyebrow themselves. Also remove **"Free beta opening in India, Nepal, Bangladesh and Sri Lanka"**, the **showcase tabs** (Speaking · Writing · Reading · Listening + the screen-reader "Showing the … demo" line) and the **stat cards** (IELTS modules 4 · Official criteria 4/4 · Part 2 prep 1:00), and **move the section below up**.

- `hero.tsx`: removed the `stats` array, the stat-card list, the beta line and unused imports (`Badge`, lucide icons); "See how it works" stays as a single link under the form.
- `hero-showcase.tsx`: removed the tablist, the `select` handler and the `aria-live` line. The demo still auto-plays and pauses on hover/focus/out of view; the device is `aria-hidden` (decorative).
- Spacing: with the right column shorter, the 84 px lift pushed the headline right under the header, so the left column lift is now **40 px** (`lg:-translate-y-10`; headline starts ~2 grid cells down). Hero bottom padding `pb-28 sm:pb-36` → `pb-24 sm:pb-28`. Net effect: the feature strip moved up ~200 px.
- Design doc §2: eyebrow, tabs and stat cards marked removed; position note updated; parallax note dropped.

**Verified:** typecheck ✓, lint ✓. Headless Chrome screenshot at 1530×1000: headline clear of the header, device and text balanced, feature strip visible in the first screen.

---

## 2026-11-22 — Hero text vertically centred, "See how it works" removed

User request: **increase the top margin**, **remove "See how it works"**, and put the headline + subtext + waitlist form **vertically in the middle** (equal space above and below).

- `hero.tsx`: removed the 40 px `lg:-translate-y-10` lift, so the text column is centred against the device by the grid's `items-center`. Removed the "See how it works" link and its now-unused imports (`Link`, `buttonVariants`, `cn`, `routes`).
- Design doc §2: position note updated.

**Verified:** typecheck ✓, lint ✓. Headless Chrome screenshot at 1530×750: text block ~190–590 px, header ends at 64 px, feature strip starts at ~693 px → ~125 px above, ~105 px below.

---

## 2026-11-22 — Live module previews in brand-rust brown

User request: the four module cards' previews should stay the same but be **live**, in **our brown (`#8C3F3F`)** instead of green.

- New client component `apps/web/src/components/landing/module-previews.tsx` (moved the four previews out of `modules-grid.tsx`, which stays a server component and imports them).
  - `useLoop()`: 8 s loop, 100 ms tick, runs only while the card is on screen (IntersectionObserver) and the tab is visible; reduced motion → fixed at 70% of the loop, no ticking.
  - Speaking: pulsing brown dot, timer counting up, waveform bars animated with the existing `wave-bar` keyframes.
  - Writing: four lines fill with brown (55% tint) one after another, blinking caret at the typing point, word count 190 → 268, countdown.
  - Reading: passage lines turn brown one per 0.8 s, then "Not Given" is selected (brown dot + text).
  - Listening: brown button with white icon (7.2 : 1), brown progress bar 25% → 75%, time ticks; Play icon during the last 1.2 s.
- Layout and copy of the cards unchanged. Design doc §4 + palette row updated.

**Verified:** typecheck ✓, lint ✓. Headless Chrome screenshot (1440×2000) after ~6 s: timers advanced (1:05, 32:04), writing caret mid-line on the last line, reading "Not Given" picked, listening bar ~70%; all brown.

---

## 2026-11-22 — Cartoon journey film: Mumbai → New York

User request: above the grey How it works section, add a **cartoon film**: a character **boards a plane in Mumbai (left)**, the plane **takes off and lands in New York**; show an **identifiable landmark** for each city.

- New `apps/web/src/components/landing/journey-scene.tsx` (client SVG, viewBox 1200×320) + `journey.tsx` (section wrapper: rounded bordered card inside `Reveal`). Inserted after `<ModulesGrid />` in `app/(marketing)/page.tsx`; modules section bottom padding reduced (`pb-10 sm:pb-14`) so the film sits close to it.
- Landmarks drawn as simplified silhouettes: **Gateway of India** (Mumbai, rust tint), **Statue of Liberty** + skyline with the **Empire State Building** (New York, sea/mint).
- Timeline (15 s, pure functions of loop time): 0–2.6 s student walks from the Gateway to the stairs → 2.6–3.4 s climbs, boards → stairs fade → 4.2–5.6 s taxi/roll → 5.6–7 s climb → 7–8 s cruise → 8–9.4 s descent → roll-out → 10.4 s stairs appear → student steps out, walks down, walks towards the city → waves. Plane pitch follows its motion (clamped ±22°), landing gear retracts in the air; walking legs/arms swing; actors fade at the loop seam; clouds drift continuously.
- Dashed flight path is **sampled from the plane's own motion** (first version used a hand-drawn curve that didn't match the plane).
- rAF clock, only while on screen and tab visible; reduced motion → final frame. `role="img"` + descriptive `aria-label`.
- Design doc §4: new "Journey film" entry.

**Verified:** typecheck ✓, lint ✓. Headless Chrome barely advances rAF, so key frames were checked with a temporary `?jt=<ms>` freeze (removed afterwards; grep confirms): 3.0 s boarding, 6.3 s climbing (nose up), 7.5 s cruising, 9.8 s landed, 11.3 s stepping down the stairs, 13.8 s waving in New York. Final screenshot in page context after removing the hook.

---

## 2026-11-22 — Journey film moved into the Modules gap, shorter, no card

User request: don't make the film a **separate module/card**; put it in the **empty space between Modules and How it works**, and **reduce its height**.

- Deleted `journey.tsx` (the card wrapper) and its import/usage in `page.tsx`. `JourneyScene` is now rendered at the bottom of `modules-grid.tsx` inside a `Reveal` (`mt-12 sm:mt-16`); modules bottom padding `pb-8 sm:pb-10`.
- `journey-scene.tsx`: sky gradient and sun removed (transparent, sits on white); viewBox cropped to `0 40 1200 262`; cruise height 150 → 110; clouds lowered/smaller; SVG capped `max-h-44 sm:max-h-52` (176 / 208 px), centred; city labels 15 → 19 SVG units so they stay readable at the smaller size.
- Design doc §4 Journey entry updated.

**Verified:** typecheck ✓, lint ✓. Headless screenshot at 1530 px wide: film ~210 px tall in the white gap under the module cards, no card, How it works directly below.

---

## 2026-11-22 — Journey film stands on the grey section edge, smaller gap above

User request: the film should sit **on the grey line** (top edge of How it works) and the **margin between the module cards and the film** should be reduced.

- `modules-grid.tsx`: section bottom padding removed (`pb-0`); film wrapper margin `mt-12 sm:mt-16` → `mt-4 sm:mt-6`.
- `journey-scene.tsx`: viewBox ends exactly at the ground (`0 40 1200 223`), so the grey section's top edge is the ground; ground line removed; runway is now a 5 px strip just above the edge with a white dashed centre line; sea line moved above the edge; "Mumbai" label moved above the Gateway, "New York" above the torch; height cap `max-h-40 sm:max-h-48`.
- Design doc §4 Journey entry updated.

**Verified:** typecheck ✓, lint ✓. Headless screenshot at 1530 px: Gateway, plane wheels, student and skyline stand on the grey edge; ~25 px gap under the cards.

---

## 2026-11-22 — Journey film: no Mumbai; plane lands in New York, student walks into NYU

User request: **remove Mumbai**; the plane just **comes from the left side and lands in New York**; the **character goes into NYU**.

- `journey-scene.tsx` rewritten timeline (13 s loop): 0–2.6 s plane flies in from off-screen left at cruise height (gear up) → 2.6–5 s long, gentle descent (pitch clamp tightened from ±22° to ±16°; the user's screenshot showed the old descent too steep) → roll-out to x=640 → stairs out → student fades in at the door, walks down, walks to the NYU door → door opens (dark), student fades in → door closes. Only a fade-out at the loop seam (plane enters off-screen).
- Removed the Gateway of India, sea line, boarding stairs and waving. New `Nyu` drawing: brick-tinted building with windows, cornice, two NYU-violet (`#57068C`) flags and a violet "NYU" banner over the door. Runway moved left (x 120–760). Flight path sampled from the plane motion up to touchdown.
- Reduced motion: student walking to NYU (8.6 s). `aria-label` updated.
- Design doc §4 Journey entry rewritten.

**Verified:** typecheck ✓, lint ✓. Key frames via the temporary `?jt=` freeze (removed; grep = 0): 1.5 s flying in, 3.8 s descending, 5.6 s landed, 7.2 s on the stairs, 9.0 s at the NYU door (door opening), 9.6 s going in.

---

## 2026-11-22 — M0-A1: Admin app shell (admin-staging.prepora.site)

**Goal (plan.md):** admin Next.js app shell on the `admin.` subdomain, sharing `packages/ui`.

Branch `feature/m0-a1-admin-shell` (from `develop` after PR #9). Read the user's own commit `b1f227e` first: the design system is now **white pages + light-green `mint` surfaces, teal → mint palette, primary `#3FC48C` with ink text, logo image** (`apps/web/public/logo.png`). The admin follows it.

**App `@prepora/admin`** (`apps/admin`): mirrors `apps/web` instead of `create-next-app`, so all versions are identical (Next 16.4.6, React 19.3, Tailwind 4.3.3, OpenNext 1.20.18, Wrangler ^4.148.0). `pnpm install` added no new packages (lockfile only gained the importer); no age-policy issues.
- Copied: `.gitignore`, `eslint.config.mjs`, `tsconfig.json`, `open-next.config.ts`, `.dev.vars.example`, `components.json` (shadcn monorepo aliases → `packages/ui`), `public/logo.png`, `public/_headers`. Generated `cloudflare-env.d.ts`.
- `next.config.ts`: `transpilePackages` (ui, shared), version/commit env, `images.unoptimized`, **security headers on every route: `X-Robots-Tag: noindex, nofollow`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`**.
- `wrangler.jsonc`: `prepora-admin-staging` → custom domain **`admin-staging.prepora.site`** (single level, so the free `*.prepora.site` certificate covers it; `admin.staging.…` would be two levels); production `prepora-admin`, **no route until launch** (admin.prepora.site, ideally behind Cloudflare Access). `workers_dev`/`preview_urls` off.
- Dev server on port 3001 (web uses 3000).

**Shell**
- `src/lib/nav.ts`: the 12 modules from plan §6 in 5 groups (Overview · Content · People · Business · System), each with icon, milestone (from plan.md), summary and planned features. Sidebar, module pages and dashboard all read from it.
- Desktop: **mint sidebar** (`mint` scheme), sticky, logo + "Admin" tag, grouped links (active = white pill + 2px green bar), footer "Not signed in · admin login arrives in M1" + `v0.1.0 · <commit>`.
- Phone (< lg): top bar with logo + menu button → mint bottom-sheet (shared Dialog) with all links.
- `(admin)/[section]/page.tsx`: one route for all 11 module pages, **prerendered via `generateStaticParams`, `dynamicParams = false`** (unknown slugs 404). Each shows icon, summary, "Arrives in Mx" and a "What you'll do here" card.
- `(admin)/dashboard`: 4 KPI tiles with **"—" placeholders naming their source + milestone** (no invented numbers), module list with milestones, mint card with links to the student staging site (landing, status, design).
- `(auth)/login`: placeholder card (sign-in arrives in M1-A1). `/` → redirect to `/dashboard`. `robots.txt` disallows all. 404 and error pages (Next 16 `{ error, retry }`).

**CI**
- New composite action **`.github/actions/cloudflare-preflight`**: the Cloudflare credentials + zone check moved out of `web.yml` (verified the script is byte-identical to the old step), so web and admin share one copy.
- `web.yml` now calls the action.
- New **`admin.yml`**: PR (admin, packages, lockfile, workflow, action paths) → lint, typecheck, OpenNext build; push to `develop` → build + preflight + `opennextjs-cloudflare deploy --env staging`. Same secrets; the token's `prepora.site` zone permissions already cover the new subdomain.
- Root scripts: `dev:admin`, `preview:admin`, `deploy:admin`.

**Verified**
- admin: lint ✓, typecheck ✓, `next build` ✓: 17 static pages (`/dashboard`, `/login`, `/robots.txt`, 11 SSG module pages).
- `next start`: `/` → 307 `/dashboard`; `/dashboard`, `/speaking`, `/audit-log`, `/login`, `/robots.txt` → 200; `/nope`, `/dashboard/x` → 404; headers present; robots `Disallow: /`.
- Screenshots: desktop dashboard and Reading module page, login, phone dashboard (no horizontal overflow) and the menu sheet (12 links).
- web lint still ✓ after the workflow change.
- **Not verified:** Linux/OpenNext build + wrangler dry run (Docker Desktop wasn't running; didn't start it). The PR's `Admin` workflow runs exactly that build.

**Note:** there's no authentication until M1-A1. The shell contains no user data, but consider Cloudflare Access on `admin-staging.prepora.site` until then.

---

## 2026-11-22 — M0-A1 follow-up: Linux/Cloudflare build verified

The A1 entry left the Linux/OpenNext build unverified (Docker was off). Docker was running now, so it was run (same steps as CI, `node:24-bookworm`, read-only repo copy, no `.env.local`):
- frozen install ✓, admin lint ✓, admin typecheck ✓, **admin OpenNext build ✓**
- `wrangler deploy --dry-run --env staging` (admin) → 1.18 MB gzipped, `WORKER_SELF_REFERENCE (prepora-admin-staging)` ✓
- web OpenNext build still ✓ (after moving the Cloudflare preflight into the composite action)

---

## 2026-11-22 — M0-I1: CI pipelines: unit tests + Cloudflare preview per PR

**Goal (plan.md):** GitHub Actions: lint, type-check, unit tests, build, Cloudflare preview deploy per PR, deploy to staging on develop.

Branch `feature/m0-i1-ci`, **stacked on `feature/m0-a1-admin-shell`** (PR not merged yet; I1 edits its `admin.yml`). Merge A1 first.

Already in place before this step: lint, type-check, build, staging deploy on `develop` (web, admin, functions, migrations). New here:

**Unit tests (Vitest 5.1.1, 4 days old → passes the age rule)**
- Root `vitest.config.mts` (`.mts` avoids Vite's CJS warning); `pnpm test` / `pnpm test:watch`. Tests sit next to the code (`*.test.ts`, relative imports) plus `tests/` for cross-package checks.
- Vitest also added as a devDependency of shared, web and admin (pnpm only lets a package import its own deps; their type-checks include the test files). Deduped, nothing new downloaded.
- **37 tests in 6 files:**
  - `packages/shared/src/api/waitlist.test.ts`: lowercases/trims, rejects bad emails, 254-char limit (same as DB), source ≤ 64.
  - `packages/shared/src/api/errors.test.ts`: `isApiErrorBody` accepts the Edge Function shape, rejects 9 malformed values.
  - `apps/web/src/lib/routes.test.ts`: `isActive` (root exact, hash links never active, prefix not look-alike); every main nav link is a known route.
  - `apps/web/.../showcase/shared.test.ts`: `mmss`, `typed`.
  - `apps/admin/src/lib/nav.test.ts`: 12 modules with unique slugs, milestones and features; dashboard excluded from section pages; `findModule`; `isActive`.
  - **`tests/contract.test.ts`**: the frontend copies must match the Deno Edge Functions (which can't import `packages/shared`): pinned region vs `_shared/region.ts`, API error codes vs `_shared/errors.ts` (parsed as text).
- **Mutation check:** set the shared region to `ap-south-1` → contract test failed as expected; reverted → 37/37 pass.
- New workflow **`unit-tests.yml`**: every PR + push to `develop`, `pnpm install --frozen-lockfile` + `pnpm test`. No path filter (seconds; shared code affects everything).

**Preview per PR (web + admin)**
- Mechanism: `opennextjs-cloudflare upload --env staging -- --preview-alias pr-<n> --tag pr-<n>` = `wrangler versions upload`: the PR build becomes a new **version** of the staging Worker with an alias URL `https://pr-<n>-prepora-<app>-staging.<subdomain>.workers.dev`. **Staging traffic is not touched**, nothing to clean up, no per-PR DNS records/certificates. Checked in OpenNext's source that args after `--` are passed through to Wrangler; dry run in Docker reached `versions upload` with the alias flags.
- New `preview` job in `web.yml` and `admin.yml` (PRs from this repo only; forks have no secrets): download build artifact → shared preflight → upload → extract URL → **one sticky PR comment per app** (`actions/github-script`, marker comment, updated on every push) + job summary. Job permissions: `contents: read`, `pull-requests: write`.
- `wrangler.jsonc` (web + admin): `"preview_urls": true` for `env.staging` only (top level and production stay off).
- **Requires a `workers.dev` subdomain on the Cloudflare account** (one-time; the account has none, which is the same thing that blocked the first web deploy). The cf CLI has no command for it and Wrangler isn't logged in, so it's a manual dashboard step. Until then the preview job fails with exactly that instruction.
- Tested offline: the upload step with a stubbed `pnpm` (success → URL extracted to `$GITHUB_OUTPUT`; "subdomain" failure → instruction + exit 1); the comment script in Node against a fake GitHub API (no comment → create; existing marker → update the same comment).
- Escaping trap: embedding the JS comment script via Python turned `"\n"` into real newlines (broke the YAML twice); now uses `String.fromCharCode(10)`. All workflows parse.

**Also**
- `docs/ci.md`: overview of every workflow, previews, shared pieces, secrets/variables.
- Regenerating `apps/web/cloudflare-env.d.ts` would have pulled in a reference to `./.open-next/worker` (present only after a local build), which could break CI's pre-build type-check → reverted, not committed.

**Verified**
- `pnpm test` 37/37 ✓; typecheck web/admin/shared ✓; lint web/admin ✓; all workflow YAML parses; `wrangler types` accepts both edited configs.
- **Not verified:** a real preview upload. It needs the workers.dev subdomain and runs on the next PR. The admin preview also needs the admin Worker to exist (after A1's first staging deploy).

**Manual steps for you**
1. Cloudflare dashboard → **Workers & Pages** → find **"Your subdomain"** (account details / settings) → choose a name (e.g. `prepora`). One-time, free.
2. Merge PR A1 (admin shell), then this PR. On this PR the preview job will show the URL in a PR comment.

## 2026-11-22 — M0-I2: Sentry and PostHog connected (no events yet)

**Goal (plan.md):** Sentry and PostHog projects created and connected (no events yet).

Branch `feature/m0-i2-observability`, **stacked on `feature/m0-i1-ci`** (which is stacked on A1). Merge order: A1 → I1 → I2.

**Code is wired and off until keys exist.** Creating the Sentry/PostHog accounts and projects is a dashboard step for you (see below and `docs/observability.md`).

**Packages** (all older than 24 h): `@sentry/nextjs` 11.16.0 + `@sentry/core` 11.16.0 (web, admin), `posthog-js` 1.453.1 (web). `pnpm-workspace.yaml`: `core-js: false` (posthog-js dependency; its postinstall only prints a donation message).

**Shared contract (`packages/shared`)**
- `src/analytics.ts`: the PostHog event contract from Implementation Plan §7. 22 events with typed properties, plus `AnalyticsPerson` for identify. A runtime list is type-checked against the interface. Exported as `@prepora/shared/analytics`.
- `src/observability.ts`: `appEnvironment(hostname)` (localhost → development, `*.workers.dev` → preview, `staging.`/`admin-staging.` → staging, else production), `releaseName()` → `prepora-<app>@<version>+<sha7>`, and Sentry privacy defaults (`dataCollection`: no automatic user info, cookies, bodies or query strings; tracing 0).
- Tests: `analytics.test.ts`, `observability.test.ts` (+13 tests).

**Sentry (web + admin)**
- Browser: `src/instrumentation-client.ts` (`@sentry/nextjs`), disabled without `NEXT_PUBLIC_SENTRY_DSN` and on localhost; captures router transitions.
- Server: new Worker entry `worker.mjs` = `withSentry` (`@sentry/nextjs/cloudflare`) around `.open-next/worker.js` (re-exports OpenNext's Durable Objects); `wrangler.jsonc` `main` points to it. DSN/release come from Worker vars `SENTRY_DSN` / `SENTRY_RELEASE`.
- `src/instrumentation.ts` `onRequestError` and the `error.tsx` / `global-error.tsx` pages use **`@sentry/core`'s `captureException`**, not `@sentry/nextjs`. The first version used `@sentry/nextjs` there, as Sentry's docs suggest, and pushed the Worker from 1.34 → **2.61 MB gzipped** (free limit 3 MB). The bundle metafile showed two ~1.4 MB copies of the Node SDK + OpenTelemetry, one from instrumentation and one from the SSR of `error.tsx`. `@sentry/core` reaches the same client through Sentry's global carrier (same version), so nothing is lost on Workers. Locally (`next dev`) server errors aren't sent.
- `next.config.ts`: `withSentryConfig` (telemetry off; source-map upload disabled until `SENTRY_AUTH_TOKEN` exists) + `NEXT_PUBLIC_SENTRY_RELEASE`.
- Edge Functions: already done in M0-B3; they only need the `SENTRY_DSN` secret.

**PostHog (web only; the admin doesn't track staff)**
- Initialised in `instrumentation-client.ts` only when `NEXT_PUBLIC_POSTHOG_KEY` is set and not on localhost. Autocapture, pageviews, pageleave, exceptions and session replay are **off**. `person_profiles: identified_only`, `persistence: memory` (no cookies/localStorage until the cookie notice, plan §7). Registers `environment` and `app_version`.
- `apps/web/src/lib/analytics`: typed `track()`, `identify()`, `resetAnalytics()`; no-ops when PostHog isn't loaded. No call sites yet: **no events**.

**CI (`web.yml`, `admin.yml`)**
- Repository variables → build env: `SENTRY_DSN_WEB` / `SENTRY_DSN_ADMIN` → `NEXT_PUBLIC_SENTRY_DSN`; `POSTHOG_KEY`, `POSTHOG_HOST` (web).
- New "Sentry Worker variables" step before upload/deploy: `--var SENTRY_RELEASE:prepora-<app>@<version>+<sha7>`, plus `--var SENTRY_DSN:…` when set. PR previews also get `--var APP_ENV:preview`. I checked OpenNext's `deploy` source, which passes the args after `--` through to `wrangler deploy`.
- Docs: new `docs/observability.md` (what runs where, setup steps, how to check); `docs/ci.md` variables; `.env.example` for web and (new) admin.

**Verified**
- `pnpm test` 50/50 ✓; typecheck shared/web/admin ✓; lint web/admin ✓.
- Linux Docker (`node:24-bookworm`, frozen install, same as CI): OpenNext build ✓ for both. `wrangler deploy --dry-run --env staging --var SENTRY_DSN:…`: **web 1.52 MB gzipped** (was 1.34), **admin 1.35 MB** (was 1.18).
- Linux Docker smoke test: built web Worker under `wrangler dev --env staging` with a fake DSN → `/` 200, `/status` 200, `/does-not-exist` 404, no errors in the log. The wrapped entry boots and serves.
- The local Windows OpenNext build fails with "Access is denied" on pnpm symlinks in `.open-next/server-functions`, a known Windows issue unrelated to this change. Use Docker/CI.
- **Not verified:** a real event reaching Sentry or PostHog (no projects/keys yet; by design no events are sent), and the CI `--var` steps on a real runner (they run on this PR).

**Manual steps for you** (details in `docs/observability.md`)
1. Sentry: create projects `prepora-web`, `prepora-admin` (Next.js) and `prepora-functions` (Deno). Add GitHub **variables** `SENTRY_DSN_WEB` and `SENTRY_DSN_ADMIN`. Run `supabase secrets set SENTRY_DSN=<functions DSN> --project-ref <staging ref>` yourself.
2. PostHog: create the project and pick a region (it's permanent). Add GitHub variables `POSTHOG_KEY` (`phc_…`) and `POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). In project settings, also turn off autocapture and replay.
3. Re-run the Web and Admin workflows on `develop` after adding the variables (keys are baked in at build time).

## 2026-11-22 — M1-C1: profiles table + RLS

**Goal (plan.md):** Migration: `profiles` table (id, full_name, role, plan, country_code, timezone, created_at) + RLS (user reads/updates own row; role can't be self-edited).

Branch `feature/m1-c1-profiles` from `develop` (A1, I1, I2 are merged).

**Migration `supabase/migrations/20261122100148_profiles.sql`**
- Enums: `app_role` (`user`, `admin`, `content_editor`) and `plan_tier` (`free`, `gold`, `platinum`), values from Implementation Plan §4. Enums give the generated TS types exact unions.
- `profiles` columns:
  - `id uuid` PK → `auth.users(id) on delete cascade`.
  - `full_name` (1–100 characters, not blank).
  - `role` (default `user`) and `plan` (default `free`), both not null.
  - `country_code char(2)` (`^[A-Z]{2}$`).
  - `timezone` (IANA name, checked against `pg_timezone_names` by a trigger, since a CHECK can't query the catalog).
  - `created_at`, plus **`updated_at`** (not in the step text; the trigger keeps it current).
- Later columns (`test_type`, `target_band`, `exam_date`, `plan_expires_at`) come with their own milestones.
- **Security:**
  - RLS policies: `authenticated` may select and update only where `(select auth.uid()) = id`.
  - Column privileges: `authenticated` may update **only** `full_name`, `country_code` and `timezone`, so `role` and `plan` (and `id`) can't be changed by the user at all. That's stronger than a policy check: the database refuses with 42501.
  - Plan stays server-only, as §4 requires (billing Edge Functions use the service role).
  - No insert/delete grants: rows come from the auth trigger (M1-B2) and go with the user.
  - `anon` has no access.
- `role`/`plan` changes by admins go through the service role for now; `is_admin()` policies come in M1-B3.

**Tests `supabase/tests/database/profiles.test.sql` (26 pgTAP)**
- Structure, defaults, enum values, FK.
- anon can't read.
- User A sees only their own row and can't read B's; A can update name/country/timezone; an update aimed at B's row changes nothing.
- Role, plan and id changes → 42501; insert/delete → 42501; unknown time zone → 22023; lowercase country and blank name → 23514.
- Values saved correctly, B unchanged, `updated_at` moves, deleting the auth user deletes the profile.
- Profiles are inserted with `on conflict do nothing`, so the tests keep working once M1-B2's trigger creates them.

**Types**
- `pnpm db:types` regenerated `packages/shared/src/db.ts` and `supabase/functions/_shared/db.ts` (profiles + enums). `db:types:check` is up to date.
- `analytics.ts` `Plan` now uses the DB enum `plan_tier` instead of a copied union.

**Verified**
- Local `supabase db reset` applies all 3 migrations ✓; `supabase test db` 38/38 ✓ (26 profiles + 12 waitlist); `supabase db lint --level error` no errors ✓.
- **Mutation check:** changed the grant to `grant update on table` (all columns) → "cannot change own role", "cannot change own plan" and "role and plan untouched" failed as expected; reverted → all pass.
- typecheck shared/web/admin ✓; `pnpm test` 50/50 ✓.
- **Not verified:** applying to staging. The DB migrations workflow does that when this merges to `develop`.

**Note:** the user says Google OAuth is already enabled on the hosted Supabase project (client ID/secret set). The local `config.toml` and the redirect URLs are M1-B1.

## 2026-11-22 — M1-C2: shared Profile/Role types + auth events

**Goal (plan.md):** Shared types: `Profile`, `Role`; auth event names (`signup_completed`, `login_completed`).

Branch `feature/m1-c2-shared-types` from `develop` (C1 merged).

**`packages/shared/src/types/profile.ts`** (new export `@prepora/shared/types/*`)
- `Profile` = generated `Tables<"profiles">`. `Role` and `Plan` = the DB enums `app_role` and `plan_tier`. They follow the migration automatically through `pnpm db:types`; no copied unions.
- `roles`, `plans` (runtime lists from the generated `Constants`); `staffRoles` (`admin`, `content_editor`) with `isStaff()` / `isAdmin()` type guards for the admin middleware (M1-A1).
- `editableProfileFields` = `full_name`, `country_code`, `timezone`, the same as the DB column grant.
- `ProfileUpdate` zod schema for the account page (M1-F3):
  - Trims the name (1–100 characters) and uppercases the country, which must be 2 letters.
  - Checks the time zone with `Intl.DateTimeFormat` (works in browsers, Node and Workers).
  - Each field is optional and can be cleared with null.
  - **`.strict()`, so `role`/`plan`/`id` are rejected.** The DB refuses them anyway (42501).

**`packages/shared/src/analytics.ts`**
- `AuthMethod = "google" | "email_otp"` (M1-B1's two methods).
- `signup_completed { method: AuthMethod; country? }` (was `method: string`); new `login_completed { method: AuthMethod }`; `authEvents` list. Total 23 events.
- `Plan` is now imported from `types/profile`.

**Tests** (+15)
- `types/profile.test.ts`: enum lists, guards, normalisation, partial/null, rejects role/plan/id, invalid name/country/timezone, schema keys = editable fields.
- `analytics.test.ts`: auth events present.
- **`tests/contract.test.ts`**: parses the migrations, finds the single `grant update (…) on table public.profiles to authenticated`, and requires it to equal `editableProfileFields` (and never contain role/plan). A later migration that changes the grant must update both.
- Mutation check: added `"plan"` to `editableProfileFields` → contract test failed; reverted → passes.

**Verified**
- `pnpm test` 65/65 ✓ (9 files); typecheck shared/web/admin ✓; lint web ✓.
- No DB change in this step, so the DB tests are unaffected.
- Same Python `"\n"` → real newline trap as in I1 while editing the test; fixed with `String.fromCharCode(10)`.

## 2026-11-22 — M1-B1: Supabase Auth (Google OAuth + email OTP), redirect URLs

**Goal (plan.md):** Enable Supabase Auth: Google OAuth + email OTP. Set redirect URLs for local, preview, staging and prod.

Branch `feature/m1-b1-auth-config` from `develop` (C2 merged). The user had already enabled Google on the hosted staging project (client ID/secret set).

**Local (`supabase/config.toml`)**
- `site_url` = `http://localhost:3000`. Redirect allowlist: `localhost` and `127.0.0.1` on `:3000` (web) and `:3001` (admin), as `/**` globs. The old default `https://127.0.0.1:3000` was wrong (https).
- Email OTP: `otp_length` 6, `otp_expiry` 3600 → **600** (10 min), `max_frequency` 1s → **60s** (same as hosted; drives the resend button).
- OTP templates: `confirmation` (new users) and `magic_link` (existing users) → `supabase/templates/otp-code.html` with `{{ .Token }}`. Minimal for now; branded in M1-B4.
- `[auth.external.google]` enabled with `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/SECRET)` from the gitignored `supabase/.env`. New `supabase/.env.example`. Supabase starts fine without them; email OTP still works.

**Shared contract `packages/shared/src/constants/auth.ts`**
- `OTP_LENGTH`, `OTP_EXPIRY_SECONDS`, `OTP_RESEND_SECONDS`, `AUTH_CALLBACK_PATH` (`/auth/callback`), and `DEFAULT_NEXT_PATH` (web `/app`, admin `/`).
- `safeNextPath()`: only same-site relative paths. It rejects `//x`, `/\x`, absolute URLs, `javascript:`, control characters (tab/newline) and > 512 characters, so the callback can't become an open redirect.
- `authCallbackUrl(origin, next)` and `normaliseOtp()` (allows spaces/dashes, exactly 6 digits).
- Tests: `constants/auth.test.ts` (20). `tests/contract.test.ts` (+3) checks OTP length/expiry/resend against `config.toml`, that Google is enabled with an env secret, and that both OTP templates contain `{{ .Token }}`.

**Hosted (dashboard; can't be changed from here)**
- `docs/auth.md` lists the exact values per environment:
  - staging Site URL and redirect allowlist, including PR preview globs;
  - OTP settings and the Google authorized redirect URI;
  - the template change;
  - production values for launch.
- Preview globs need the real workers.dev subdomain. Using `*` for it would let anyone with their own workers.dev account become a redirect target, so the doc says not to.
- `config.toml` `[remotes]` / `supabase config push` were not used: pushing would overwrite other hosted auth settings, and the CLI isn't linked.

**Verified**
- `supabase stop/start` with the new config ✓ (no Google env vars present).
- Local GoTrue end to end:
  - `/settings` → google ✓, email ✓.
  - `POST /otp` → 200; Mailpit email "Your Prepora sign-in code" with a 6-digit code; `POST /verify` → 200 with session.
  - Reusing the code → 403; resend within 60 s → 429.
- Redirect allowlist (local, read from `auth.flow_state.referrer`): `localhost:3000/auth/callback?next=/app` and `localhost:3001/auth/callback` kept; `https://evil.example/steal` and `http://localhost:3000.evil.example/x` → fell back to the site URL.
- Hosted staging (public `/auth/v1/settings`, publishable key): google ✓, email ✓, signup enabled. The authorize redirect sends `redirect_uri=https://xvaxqiumdmgdvmbsqcub.supabase.co/auth/v1/callback` to Google. The hosted allowlist and templates are not readable from outside → **not verified**.
- `pnpm test` 88/88 ✓; typecheck shared ✓. Mutation check: `otp_expiry` → 3600 in config → contract test failed; reverted.
- Tooling note: in this environment, Bash heredocs turned `\` into `\` (broke a regex and test strings). Fixed with the Edit tool; files with backslashes should be edited that way.

**Manual steps for you** (`docs/auth.md`, "Staging")
1. Supabase → Authentication → URL Configuration: Site URL `https://staging.prepora.site`, plus the 4 redirect URLs (replace `<subdomain>` with your workers.dev subdomain).
2. Email provider: OTP length 6, expiration 600 s.
3. Google Cloud OAuth client: confirm `https://xvaxqiumdmgdvmbsqcub.supabase.co/auth/v1/callback` is an authorized redirect URI. For local Google sign-in, also add `http://127.0.0.1:54321/auth/v1/callback` and fill `supabase/.env`.
4. Email Templates: put `supabase/templates/otp-code.html` into **Confirm signup** and **Magic Link**.

## 2026-11-22 — M1-B1 (revised): Google only, email OTP removed

**Request:** "remove OTP sign in i only want is oauth sign in and sign up". Same branch `feature/m1-b1-auth-config` (not merged yet), new commit on top.

**Changes**
- `supabase/config.toml`:
  - `[auth.email] enable_signup = false` disables the whole email provider (OTP, magic link, password).
  - Removed the OTP template blocks and `supabase/templates/otp-code.html`.
  - OTP length/expiry/frequency back to the CLI defaults (unused now).
  - `[auth] enable_signup` stays `true`, because Google creates the accounts.
- `packages/shared/src/constants/auth.ts`: removed `OTP_*` and `normaliseOtp`; added `AUTH_PROVIDER = "google"`. `safeNextPath` / `authCallbackUrl` / `AUTH_CALLBACK_PATH` stay.
- `analytics.ts`: `AuthMethod = "google"`.
- `tests/contract.test.ts`, rewritten auth section:
  - sign-up open;
  - email provider off and no email templates;
  - Google enabled with an env secret;
  - **Google is the only enabled method** (scans every `[auth.external.*]`, `[auth.web3.*]` and `[auth.sms]` table) and anonymous sign-in is off.
- `docs/auth.md` rewritten for Google only. Staging now needs **Email provider turned off** (it's on today: public settings show `email: true`).
- **plan.md** (M1 row, B1, B4, F1, I1, exit) and Implementation Plan (architecture box, checklist): email OTP replaced.
  - B4 (OTP templates + SMTP) marked not needed while there are no auth emails.
  - I1's Playwright test now uses a user created with the service role, since Google can't be automated.

**Verified**
- Local Supabase restarted with the new config. `/settings` → google ✓, email ✗.
  - `POST /otp` for a new and an existing user → 422 "Email logins are disabled".
  - Password signup → 400 "Email signups are disabled"; password login → 422.
  - Google authorize → 302 to accounts.google.com.
  - The service role can still create users (`/admin/users` → 200), for tests and seeds.
- `pnpm test` 84/84 ✓; typecheck shared ✓.
- Mutation checks: enabling `[auth.external.apple]` → "no other sign-in method" failed; `[auth.email] enable_signup = true` → "email provider is off" failed; both reverted.
- **Not verified:** the staging dashboard (Email still on until you switch it off).

## 2026-11-22 — M1-F1: Sign-up and login pages ("Continue with Google")

**Goal (plan.md):** Sign-up and login pages: "Continue with Google" (the only method).

Branch `feature/m1-f1-auth-pages` from `develop` (B1 incl. the Google-only revision merged).

**Pages and route (apps/web)**
- `(auth)/layout.tsx`: logo bar on mint with the grid texture and the content centred; no site nav; safe-area bottom padding.
- `/login` ("Welcome *back*") and `/signup` ("Start practising *free*", plus a Terms/Privacy line). Both use `components/auth/auth-panel.tsx`:
  - the heading;
  - an error banner (only for our own codes: `cancelled`, `callback`, `config`; anything else in `?error=` is ignored);
  - the Google button and a link to the other page, which keeps `?next=`.
  - Signed-in visitors are redirected to `next`.
- `components/auth/google-button.tsx` (client):
  - Calls `signInWithOAuth({ provider: AUTH_PROVIDER, redirectTo: authCallbackUrl(origin, next, "/app"), queryParams: { prompt: "select_account" } })`.
  - Loading state "Opening Google…"; a toast and reset if Google can't be reached.
  - Google "G" mark in standard colours.
- **`/auth/callback` route handler:**
  - `?code=` → `exchangeCodeForSession` (sets cookies) → safe `next`.
  - `?error=access_denied` → `/login?error=cancelled`; other errors, a missing code or a failed exchange → `/login?error=callback`; Supabase not configured → `config`. `next` is kept on errors.
- `/app`: placeholder signed-in home ("Welcome, *name*", from Google's `full_name`/`name`, else the email). Signed-out visitors → `/login?next=/app`. M1-F2 moves this guard into proxy.ts for all of `/app/*`.
- `lib/auth.ts`: pure helpers `callbackStep`, `nextPath`, `loginUrlWithError`, `authErrorMessage` (uses `Object.hasOwn`, so `?error=toString` isn't treated as a known code).
- `lib/supabase/session.ts`: `getCurrentUser()` (uses `getUser()`, which validates with Supabase; returns null when Supabase isn't configured).
- `routes.ts`: `authCallback`, `app`. **`waitlistMode` → `false`**, as its comment planned for M1, so the header shows "Log in" + "Start free". While Google's consent screen is in Testing, only test users can actually sign in. The landing hero still has the waitlist form.

**Tests** (+12): `lib/auth.test.ts` (callback outcomes, unsafe next → `/app`, error mapping, unknown codes); `routes.test.ts` (`authCallback` = `AUTH_CALLBACK_PATH`, `app` = `DEFAULT_NEXT_PATH.web`).

**Verified**
- typecheck web ✓; lint web ✓; `pnpm test` 92/92 ✓.
- HTTP checks on the running dev server (port 3000, which was already running and points at staging Supabase; a second dev server isn't allowed, and I didn't stop it):
  - `/login`, `/signup` → 200 with the Google button; `?error=cancelled` shows the message; `?error=<script>` shows nothing.
  - Cross-links keep `next`.
  - `/app` signed out → 307 `/login?next=%2Fapp`.
  - Callback: `access_denied` → `/login?error=cancelled&next=…`; bogus code / no code / `server_error` → `/login?error=callback`; bogus code with `next=//evil.com` → error without the evil next.
  - Header on `/` now shows "Log in" / "Start free".
- OAuth request against local Supabase (supabase-js with the button's options): `redirectTo` `http://localhost:3000/auth/callback?next=%2Fapp%2Fwriting`, PKCE `s256`, `prompt=select_account`, 302 to Google; `auth.flow_state.referrer` stored that exact URL (allowlisted, not replaced by the site URL).
- **Not verified:** a full Google round trip (needs a real Google login), the session cookie after the exchange, and `/app` signed in. Also not checked visually in a browser or on a phone; no OpenNext build in Docker for this step (CI builds it on the PR).

**To test after merge (staging):** with the staging redirect URLs set (docs/auth.md) and your Google account listed as a test user, open https://staging.prepora.site/signup → Continue with Google → you should land on `/app` with your name.

## 2026-11-22 — Diagnosis: Google "Error 401: invalid_client" on staging sign-in

**Symptom (user screenshot):** "Access blocked: Authorization Error. The OAuth client was not found. Error 401: invalid_client".

**Finding:**
- Staging Supabase sends `client_id=013822775479-q1p8pdm35s4hm7i8a8l8ckc23ljq7qa0.apps.googleusercontent.com`, read from its public `/auth/v1/authorize` redirect.
- Google says no OAuth client with that ID exists. The cause is the Client ID saved in **Supabase → Authentication → Sign In / Providers → Google**, not the app code or the redirect URIs (a wrong redirect URI gives `redirect_uri_mismatch` instead).
- The leading `0` is suspicious: Google project numbers don't start with 0, so a stray character was likely pasted. Other possibilities: the client was deleted, or it belongs to another Google Cloud project.

**Fix (user):**
1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs, type **Web application**. Copy its Client ID and secret.
2. Paste both into the Supabase Google provider and save.
3. On that client, Authorized redirect URIs must include `https://xvaxqiumdmgdvmbsqcub.supabase.co/auth/v1/callback`.

**Side note:** locally, with no `supabase/.env`, the CLI passes the literal text `env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)` as the client ID, so local Google sign-in fails the same way until that file is filled. Expected, as documented in docs/auth.md.

No code change.

## 2026-11-22 — M1-F1 verified on staging: Google sign-in works end to end

- The user replaced the Supabase Google provider's Client ID and secret with the current Web client (`1013822775479-b5euom…`). Staging's authorize redirect now sends that ID (checked).
- The user signed in with Google on staging and landed on `/app`: "Welcome, *Atharv Babar*", signed in as their Gmail address (screenshot).
- This covers the part F1's log left unverified: the Google round trip, the code exchange in `/auth/callback`, the session cookie, and `/app` signed in.
- Security follow-up for the user: the Google client secret was pasted into the chat. Rotate it in Google Cloud (add a new secret → update Supabase → disable the old one).
- **Incident (my mistake):** the first push of this branch used `git commit -a`, which also swept in the user's *uncommitted* local edits. Those edits put real Google client values into `supabase/.env.example` (a tracked file; adding it to `supabase/.gitignore` doesn't untrack it). That commit (`84c4a4b`) was pushed to `origin/chore/log-m1-f1-verified`. I reset the branch, re-committed only `log.md` and force-pushed over it. The user's local edits are still in the working tree, uncommitted. **The secret must be rotated regardless:** GitHub can keep the old commit reachable by its SHA. From now on: commit explicit paths only, never `-a`.

## 2026-11-22 — M1-F2: Session middleware, /app/* protected

**Goal (plan.md):** Session handling with `@supabase/ssr`: middleware that refreshes the session and protects `/app/*` routes.

Branch `feature/m1-f2-session-middleware` from `develop` (F1 merged).

**Decision: `src/middleware.ts` (Edge), not Next 16's `proxy.ts`.** `proxy.ts` always runs on Node.js. OpenNext Cloudflare 1.20 detects Node middleware and warns that it is "experimental … not officially maintained … use at your own risk"; Edge middleware is its supported path. Next 16 still runs `middleware.ts` and prints a deprecation notice at build. Revisit when OpenNext supports `proxy.ts` properly.

**Changes (apps/web)**
- `src/middleware.ts`, following Supabase's SSR guide:
  - `createServerClient` → `getClaims()`, with nothing in between. That verifies the token and refreshes it when expired.
  - Refreshed cookies are written to the request (for this render) and the response.
  - The `Cache-Control: private, no-cache, no-store…` headers that @supabase/ssr passes are applied.
  - Then `routeDecision`: signed out on `/app/*` → `/login?next=<path+query>`; signed in on `/login`/`/signup` → safe `next` or `/app`.
  - Redirects carry the refreshed cookies and `private, no-store`, and signed-in responses get `private, no-store`.
  - Matcher: `/app`, `/app/:path*`, `/login`, `/signup` only. Marketing pages stay static/cacheable; `/auth/callback` sets the session itself.
- `src/lib/auth-routes.ts`: pure `isProtectedPath` (`/app` and `/app/…`, not `/apple`), `isAuthPage`, `routeDecision`. Tests: `auth-routes.test.ts` (+15).
- `/login`, `/signup`: removed their own "already signed in" check (middleware does it; saves an Auth call). `/app` keeps `getCurrentUser()` as a second line of defence and to read the name.
- Comments in `lib/supabase/server.ts` and the `/app` page now say `src/middleware.ts` instead of `proxy.ts`.

**Verified**
- typecheck web ✓; lint web ✓; `pnpm test` 107/107 ✓.
- `next build` against local Supabase ✓ (route list shows "ƒ Proxy (Middleware)"). `.next/server/middleware-manifest.json` has an **Edge** middleware with exactly the 4 matchers; `functions-config-manifest` has no Node middleware, so OpenNext uses its supported path.
- `next start` on :3100 against local Supabase with **real session cookies**. The user was created with the service role, the session minted via admin `generate_link` + `verify` (Google can't be automated), and the cookies encoded by @supabase/ssr itself (`sb-127-auth-token`). Script deleted afterwards.
  - Signed out: `/app` → 307 `/login`; `/app/writing?task=2` → 307 `/login?next=%2Fapp%2Fwriting%3Ftask%3D2`; `/login` 200; `/` 200, not matched (still `s-maxage` static).
  - Signed in: `/app` 200 "Welcome"; `/login` → 307 `/app`; `/signup?next=/app/reading` → 307 `/app/reading`; `/login?next=//evil.com` → 307 `/app`. All `private, no-store`.
  - Expired access token with a valid refresh token: `/app` 200, 1 Set-Cookie with a **new** access token whose expiry is in the future.
  - Garbage cookie → 307 `/login`. After a global logout, the old refresh token → 307 `/login` and the cookie is cleared.
- **Not verified:** the OpenNext/Workers build in Docker. Docker Desktop's VM has 3.7 GB RAM, shared with 12 local Supabase containers. Two runs lost the client connection ("unexpected EOF"); one container exited 0 but `--rm` removed its logs before they could be read; the third attempt hit Docker engine 500 errors. The PR's Web workflow runs the same OpenNext build on a clean runner.
- **Not verified on staging** yet: after merge, sign in → `/app`, open `/login` (should bounce to `/app`), sign out isn't built yet (M1-F3).

## 2026-11-22 — M1-F2 follow-up: Docker/Workers verification done

- First attempts failed in Docker, not in the app. Docker Desktop's VM has 3.7 GB, shared with 12 local Supabase containers; the client lost the connection ("unexpected EOF") and then the engine returned 500 errors.
- Fix: `docker desktop restart`; `supabase stop` during the build (data kept); container run detached with output to a mounted file.
- Result (`node:24-bookworm`, frozen install, placeholder public Supabase values):
  - OpenNext build ✓ (Edge middleware); dry run **1.95 MB gzipped** (was 1.52 MB before F2: the middleware bundles @supabase/ssr + supabase-js; free limit 3 MB).
  - `wrangler dev --env staging`: `/` 200, `/app` → 307 `/login`, `/app/writing?task=2` → 307 `/login?next=%2Fapp%2Fwriting%3Ftask%3D2`, `/login` 200, `/status` 200.
- CI also passed for the F2 PR (Web workflow), and the `develop` staging deploy succeeded.

## 2026-11-22 — M1-F3: Logout, account menu, profile page (name)

**Goal (plan.md):** Logout, "account" menu, basic profile page (name).

Branch `feature/m1-f3-account` from `develop` (F2 merged).

**Changes**
- `packages/ui/src/components/dropdown-menu.tsx`: new dropdown on Base UI `Menu` (Root/Trigger/Content/Item/LinkItem/Label/Separator). Keyboard, focus return and roles come from Base UI. Rounded popup in the design tokens.
- `apps/web/src/app/(app)/app/layout.tsx`: signed-in shell, a sticky white glass header with the logo and **account menu**. It calls `getAccount()` again (second line of defence after the middleware).
- `components/account/account-menu.tsx`: avatar button with initials (`aria-label="Account menu for <name>"`); the menu shows name + email, **Profile**, **Log out** (calls the `signOut` server action in a transition: "Logging out…").
- `/app/profile` + `components/account/profile-form.tsx`:
  - Name field with `useActionState`: inline field error, form error, a "Name saved" toast, and a Saving… state.
  - Email shown read-only ("From your Google account").
  - If the profile row doesn't exist yet (M1-B2's trigger isn't built), a "still being set up" notice is shown and the form is disabled.
- `lib/account-actions.ts` (`"use server"`):
  - `signOut()` → `auth.signOut({ scope: "local" })` (this device only), revalidate, redirect `/`.
  - `updateProfileName()` → `ProfileUpdate` (shared zod, strict) → `getUser()` → `update profiles set full_name` for the caller's row (RLS + column grant from M1-C1).
  - Zero rows updated → "profile isn't set up yet"; DB error → generic message, logged.
  - Each action checks the session itself; Server Functions are public endpoints.
- `lib/supabase/session.ts`: `getCurrentUser` and the new `getAccount` (user + own profile row + display name) are wrapped in React `cache()`, so the layout and page share one Auth call per request.
- `lib/account.ts`: `displayName()` (profile name → Google name → email → "Account") and `initials()`. Tests: `account.test.ts` (+10).
- `routes.profile` = `/app/profile`. The `/app` page now uses the layout's header.

**Verified**
- typecheck web + ui ✓; lint web ✓; `pnpm test` 115/115 ✓; `next build` ✓ (`/app`, `/app/profile` dynamic).
- `next start` on :3100 against local Supabase. A real session was minted with the service role; server actions were called with **React's own `encodeReply`** (as the browser sends them), using the action IDs from the build manifest.
  - `/app`: menu button for "Test Student" with initials "TS".
  - `/app/profile` without a profile row: notice shown, input disabled; the action returns "profile isn't set up yet".
  - With a row (created with the service role as a stand-in for M1-B2): `"  Asha Rao "` → saved as `Asha Rao`; blank → "Enter your name."; 101 chars → "Use 100 characters or fewer."; extra `role=admin`, `plan=platinum` fields → name saved, **role stays `user`, plan `free`** (checked in the DB).
  - Menu shows the saved name after revalidation.
  - Log out → `x-action-redirect: /`, the auth cookie cleared. `/app` with the browser's cookies → 307 `/login`; **replaying the old cookie** → 307 `/login`; the name action after logout doesn't change the DB.
- Test hiccups (not app bugs):
  - A `next start` left over from F2's test was still on :3100, so the first run hit the old build. I identified its command line, stopped it, and reran.
  - My hand-built action body first used the wrong field prefix (`1_` instead of React's `_1_`), so every save looked like "Enter your name". Switched to `encodeReply`.
- **Not verified:** in a real browser (menu opening, keyboard navigation, toast, mobile layout) or on staging. The staging profile page will show "still being set up" until **M1-B2** (sign-up trigger) creates profile rows.

## 2026-11-22 — M1-A1: Admin login + role guard (admin, content_editor)

**Goal (plan.md):** Admin login (same Supabase Auth) + middleware that allows only `role in (admin, content_editor)`.

Branch `feature/m1-a1-admin-auth` from `develop` (F3 merged; F4 is on its own branch).

**Changes (apps/admin)**
- Deps: `@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.119.2, `server-only`. These are the same versions as web; the lockfile only adds links, no new downloads.
- `lib/supabase/{env,client,server}.ts`: same pattern as web; same Supabase project and public keys.
- **`src/middleware.ts`** (Edge, for the same OpenNext reason as web):
  - `getClaims()` (refreshes the session), then the user's **own** `profiles.role` via RLS.
  - Matches every path except static files. Every response is `private, no-store`; redirects keep refreshed cookies.
  - **Fail closed:** no profile row, a lookup error or an unknown role = no access.
- **`lib/access.ts`** (pure, tested), `accessDecision`:
  - signed out → `/login?next=…` (`/forbidden` → `/login`);
  - signed in but not staff → `/forbidden` (also from `/login`);
  - staff on `/login` or `/forbidden` → safe `next` or `/dashboard`;
  - `/auth/callback` always passes.
- `/auth/callback` (code exchange → `next`); `/login` with a real "Continue with Google" button (`components/google-button.tsx`) and known error codes only.
- **`/forbidden`**: "No admin access", signed in as `<email>`, "Sign out and switch account".
- `(admin)/layout.tsx`: a **second check** (`getViewer()` = `getUser()` + own role; redirects to `/login` or `/forbidden`) before rendering. The sidebar and mobile menu show name, email, a role badge (Admin / Content editor) and **Sign out** (`components/account-block.tsx`, `sign-out-button.tsx`, `lib/actions.ts` → `signOut({ scope: "local" })` → `/login`).
- `.env.example` (Supabase URL/key added); `admin.yml` passes the existing `NEXT_PUBLIC_SUPABASE_*` repository variables to the build.

**Verified**
- typecheck admin ✓; lint admin ✓; `pnpm test` 123/123 ✓ (`access.test.ts` +13; F4's tests aren't on develop yet).
- Admin `next dev` on :3101 against local Supabase, with **real sessions** for 4 users (service-role created; profile rows inserted with the role as a stand-in for M1-B2/B3) plus anonymous. Paths: `/`, `/dashboard`, `/users?q=a`, `/login`, `/login?next=/users`, `/forbidden`.
  - anonymous: everything → `/login` (`/users?q=a` keeps `next`); `/login` 200; `/forbidden` → `/login`.
  - `user` role **and** no profile row: everything → `/forbidden`, including `/login`; `/forbidden` 200 with the "No admin access" page.
  - `content_editor` and `admin`: `/dashboard` and `/users` 200 with the admin shell; `/login` → `/dashboard`; `/login?next=/users` → `/users`; `/forbidden` → `/dashboard`.
  - A `user` PATCHing their own `role=admin` through the REST API → **403 / 42501** (M1-C1 column grant); still `/forbidden` afterwards.
  - Demoting an admin to `user` with the service role → the next request goes to `/forbidden` (the role is read per request).
- **Not verified:**
  - The OpenNext build in Docker (machine memory is tight; CI builds it on the PR).
  - A real Google sign-in on admin-staging.
  - Clicking Sign out in a browser.
- **To use on staging:** someone needs a profile row with role `admin`. Rows are created by M1-B2's trigger (not built yet), and M1-B3 seeds the first admin. Until then, `admin-staging.prepora.site` shows "No admin access" for everyone, which is the intended fail-closed behaviour.

## 2026-11-22 — M1-I1: Playwright end-to-end tests + RLS through the API

**Goal (plan.md):** Playwright: signed-in user (created with the service role on local Supabase, since Google can't be automated) → lands on `/app`; signed-out → redirected to login. RLS test: user A can't read user B's profile.

Branch `feature/m1-i1-e2e` from `develop` (F4 and A1 merged).

**Setup**
- `@playwright/test` **1.65.1** (9 days old; passes the age rule) in apps/web, Chromium only. Scripts `e2e`, `e2e:ui`. Playwright output folders are gitignored.
- `apps/web/playwright.config.ts`:
  - builds the app and serves it on **:3200** (no clash with `next dev` on :3000) with the **local** Supabase URL/key;
  - projects **mobile** (Pixel 7) and **desktop** (Chrome);
  - 2 workers and a 10 s expect timeout (see below); CI: 1 retry, html + github reporters.
- `apps/web/e2e/support/local-supabase.ts`:
  - Keys from `supabase status -o json`, read once in the main process and passed to workers via `E2E_SUPABASE_*`, with one retry. **Refuses any non-local Supabase URL.** No keys in the repo.
  - `createTestUser(name, role)`: admin `createUser`, upsert the profile row (stand-in for M1-B2), `generateLink` + `verifyOtp` (a real session even though the email provider is off for real users), cookies encoded by `@supabase/ssr` itself, plus a client signed in as that user.
  - `deleteTestUser` (the profile cascades).

**Tests (12 runs = 8 browser tests × 2 projects + 4 API tests once)**
- `e2e/auth.spec.ts`:
  - signed out: `/app` → `/login` (heading + Google button); `/app/profile` → `/login?next=%2Fapp%2Fprofile`;
  - signed in: lands on `/app` with "Welcome, Asha Rao" and the account menu; `/login` → `/app`;
  - log out from the account menu → `/`, then `/app` → `/login`.
- `e2e/rls.spec.ts` (PostgREST with real user sessions, desktop only): A can't read B (empty); A sees exactly one profile (their own); A updating B changes nothing (B unchanged); A setting their own `role=admin` → **42501**.

**CI:** new `.github/workflows/e2e.yml`.
- `supabase start -x` everything except db/auth/rest/kong.
- `playwright install --with-deps chromium`, then `pnpm --filter @prepora/web e2e`.
- On failure, uploads the report and traces. No secrets. `docs/ci.md` updated.

**Verified (locally, Windows)**
- First full run: 11/12. One mobile worker's `supabase status` call failed while Supabase was running, from parallel CLI calls. Fixed by resolving once and passing env vars.
- Next run: 8/12. The 4 signed-in tests timed out under load (this machine has ~1 GB free RAM); they pass alone. Fixed with 2 workers and a 10 s expect timeout.
- Then **12/12 three times** (1.3–1.5 min), the last time against a **CI-like slim Supabase** (only `supabase_db`, `auth`, `rest`, `kong` running).
- **Mutation check:** made `isProtectedPath` return false.
  - The deep-link test failed (no `?next=`).
  - `/app` still landed on `/login` because the `/app` layout's own `getAccount()` check redirected: the second line of defence works.
  - Reverted (no diff).
- typecheck web ✓; lint web ✓; `pnpm test` 132/132 ✓; workflow YAML parses; the `-x` container names match `supabase start --help` for CLI 2.116.0.
- **Not verified:** the workflow on a GitHub runner (first run is on this PR).
- Local Supabase is left running in the slim mode (4 containers, less RAM). `supabase stop && supabase start` brings back Studio/Mailpit/etc.

## 2026-11-22 — M2-C1: Onboarding fields, country_regions, waitlist final shape

**Goal (plan.md):** Migration: add `test_type`, `target_band`, `exam_date` to `profiles`; create `country_regions` (country_code, region, launch_wave, is_enabled); move `waitlist` to its final shape.

Branch `feature/m2-c1-onboarding-schema` from `develop` (M1-I1 merged).

**Migration `20261122155735_onboarding_countries_waitlist.sql`**
- **profiles:**
  - New enum `ielts_test_type` (`academic`, `general`) for `test_type`.
  - `target_band numeric(2,1)`: 1.0–9.0, **half steps only** (`target_band*2` must be whole).
  - `exam_date date`: 2020-01-01 to 2100-12-31; null = not booked, since the onboarding step is skippable.
  - **Column grant** extended: the user may now also update `test_type`, `target_band`, `exam_date` (onboarding, M2-F2). `role`/`plan` are still server-only.
- **country_regions:**
  - New enum `market_region` (`IN`, `SA`, `SEA`, `EA`, `ANZ`; same values as `prices.region` in §4).
  - Columns: `country_code char(2)` PK (`^[A-Z]{2}$`), `region` not null, `launch_wave smallint` 1–9 (null = not scheduled), `is_enabled` default **false**, `updated_at` (trigger `touch_updated_at()`).
  - Partial index on enabled countries.
  - RLS: **anyone (anon + authenticated) can read** (the gate runs before sign-in; non-personal data); **no writes through the API**. The service role seeds it (M2-B1); admin write policies come with `is_admin()` (M1-B3, not built yet).
  - Countries not listed = not enabled, so non-APAC visitors simply get the waitlist.
- **waitlist "final shape".** The plan doesn't spell it out; this is my interpretation for M2-A2 (admin list/export) and the beta invites:
  - `invited_by` (admin who invited, FK auth.users, set null on delete), with a check that `invited_by` requires `invited_at`;
  - `user_id` (the account the entry became; FK, set null; unique when set);
  - partial index on not-yet-invited entries per country.
  - Still written only via `join_waitlist()` (unchanged) or the service role; still unreadable through the API.
  - **No FK** from `waitlist.country_code` to `country_regions`, because people from countries outside the list must still be able to join.

**Shared contract**
- `editableProfileFields` += `test_type`, `target_band`, `exam_date`.
- New `TestType`, `testTypes`, `TARGET_BAND_MIN/MAX`.
- `ProfileUpdate` gains `test_type` (enum), `target_band` (1–9, `multipleOf(0.5)`), `exam_date` (`z.iso.date`, same bounds as the DB).
- **Contract test:** now takes the **union of all** `grant update (...) on table public.profiles to authenticated` across migrations (sorted) and fails if any column-level revoke on profiles ever appears.
- DB types regenerated in both copies (`country_regions`, the two enums, new profile columns).

**Verified**
- `supabase db reset` applies all 4 migrations ✓.
- `supabase test db` **68/68** ✓. New `onboarding_countries.test.sql` (30):
  - columns and types;
  - a user can set and clear the onboarding fields;
  - 7.3 / 9.5 / 0.5 / 1999 date / unknown test type are rejected;
  - role/plan still 42501;
  - anon reads country_regions; anon/authenticated can't insert or enable (42501);
  - lowercase code rejected; waitlist new columns; `invited_by` without `invited_at` rejected.
  - M1-C1's `profiles.test.sql` column list updated for the 3 new columns.
- `supabase db lint --level error`: no errors.
- `pnpm test` **141/141** ✓ (+9 `ProfileUpdate` onboarding cases); typecheck shared/web/admin ✓.
- Mutation check: removed `exam_date` from the migration grant → contract test failed; reverted.
- **Not verified:** applying to staging (the DB migrations workflow does it after merge).
- Note: staging profiles created by hand (the admin SQL from earlier) just get null onboarding fields.

## 2026-11-22 — M2-C2: Onboarding Zod schema + onboarding/waitlist events

**Goal (plan.md):** Zod schemas for onboarding input; event names `onboarding_completed`, `waitlist_joined`.

Branch `feature/m2-c2-onboarding-contract` from `develop` (M2-C1 merged).

**`packages/shared/src/api/onboarding.ts`** (import `@prepora/shared/api/onboarding`)
- `onboardingInput(today)` is a **schema factory** taking "today" (YYYY-MM-DD in the student's time zone), so "not in the past" is enforceable and tests are deterministic. `.strict()`, so `role` etc. are rejected.
  - `test_type`: `academic | general` (required).
  - `target_band`: **4.0–9.0** in half steps (required). The DB allows 1.0–9.0; onboarding offers the realistic goal range.
  - `exam_date`: ISO date **≥ today** and **≤ today + 2 years**, or **null** (skipped). The field must be present: `null` explicitly means "skipped".
- `onboardingBands` (4, 4.5, … 9) for the picker; `onboardingSteps` (`test_type`, `target_band`, `exam_date`); `needsOnboarding(profile)` (true until test type and band are set; for the redirect in M2-F2).
- `addYears` clamps Feb 29 → Feb 28.

**`packages/shared/src/analytics.ts`**
- `onboarding_completed` tightened: `{ test_type: TestType; target_band: number; exam_date: string | null; days_to_exam: number | null }`. Was `test_type: string`, `exam_date?`; `days_to_exam` is added so funnels don't need date maths.
- `waitlist_joined` documented: `{ country?: ISO-2 from CF-IPCountry; source: utm_source | "hero" | "final_cta" | "gate" }`. The new `"gate"` source is for the country gate's waitlist (M2-F1).
- `onboardingEvents` list. Total events unchanged (23); both already existed from §7.

**Tests** (+18):
- `api/onboarding.test.ts`: complete answer; skip with null; today allowed; 11 rejections (missing/unknown test type, band 3.5/7.25/9.5, yesterday, more than 2 years, wrong date format, missing `exam_date`, extra `role`); exactly 2 years OK; Feb-29 clamp.
- **Every valid onboarding answer also passes `ProfileUpdate`**, so it fits the DB rules (no contract drift).
- `analytics.test.ts`: events present; type-level checks for `test_type` and `exam_date`.

**Verified:** `pnpm test` 159/159 ✓; typecheck shared ✓, web ✓. No app code uses these yet (M2-F2 and the gate do); no DB change.

## 2026-11-22 — CI fix: Supabase "address already in use" on port 54322

**Symptom:** E2E on the M2-C2 PR failed in "Start local Supabase": `failed to bind host port 0.0.0.0:54322/tcp: address already in use`. The same workflow had passed on `develop` 20 minutes earlier.

**Cause:** Supabase's fixed host ports (54320–54329 in `supabase/config.toml`) lie inside Linux's default **ephemeral port range** (32768–60999). An outgoing connection on the runner (Docker pulling images) can be handed one of those ports just before Postgres binds it. It's random, so it's intermittent; a plain re-run would usually pass and then fail again some other day.

**Fix (on the M2-C2 branch, so this PR tests it):**
- `e2e.yml` and `db-migrations.yml` (`validate` job): a first step `sudo sysctl -w net.ipv4.ip_local_port_range="60000 65535"` moves ephemeral ports above all Supabase ports.
- One retry around `supabase start` / `supabase db start` (`stop --no-backup` in between), with a `::warning::` when it happens.
- Other jobs don't start a local Supabase (checked with grep).

**Verified:** both workflow files parse; the retry lines pass `bash -n`. **Not verified yet:** the next CI run on this PR.
