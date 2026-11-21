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
