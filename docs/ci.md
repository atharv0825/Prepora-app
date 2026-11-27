# CI/CD (GitHub Actions)

M0-I1 summary of every pipeline. Branches: `feature/*` → PR into `develop` (staging) → later tagged releases on `main` (production, not set up yet).

| Workflow | Runs on | What it does |
|---|---|---|
| **Unit tests** (`unit-tests.yml`) | every PR, push to `develop` | `pnpm test` (Vitest): unit tests next to the code (`*.test.ts`) + contract tests in `tests/` that check the frontend's copies of shared values (pinned region, API error codes) still match the Edge Functions |
| **Web** (`web.yml`) | PR / push touching `apps/web`, `packages`, lockfile | lint, type-check (web, ui, shared), OpenNext build → **PR: preview version** → **develop: deploy** to https://staging.prepora.site |
| **Admin** (`admin.yml`) | PR / push touching `apps/admin`, `packages`, lockfile | lint, type-check, OpenNext build → **PR: preview version** → **develop: deploy** to https://admin-staging.prepora.site |
| **Edge Functions** (`edge-functions.yml`) | PR / push touching `supabase/functions` | `deno check --frozen` → develop: deploy functions to Supabase staging |
| **DB migrations** (`db-migrations.yml`) | PR / push touching `supabase/` | fresh local DB: migrations + lint + pgTAP tests + generated-types check → PR: dry-run push to staging → develop: `supabase db push` |

## Preview per PR (web and admin)

- The PR's build is uploaded as a new **version** of the staging Worker with alias `pr-<number>` (`opennextjs-cloudflare upload -- --preview-alias pr-<n>`). Staging traffic is not affected.
- URL: `https://pr-<n>-prepora-web-staging.<subdomain>.workers.dev` (admin: `prepora-admin-staging`). The workflow posts it as **one PR comment** per app and updates that comment on every push.
- Previews use the staging bindings and data (Supabase staging).
- **One-time requirement:** a `workers.dev` subdomain on the Cloudflare account (dashboard → Workers & Pages → "Your subdomain"). Until then the preview job fails with that instruction. `preview_urls: true` is set for the staging environment in each `wrangler.jsonc`.
- Skipped for PRs from forks (no secrets). The admin preview needs the admin Worker to exist, i.e. after its first staging deploy.

## End-to-end tests (M1-I1)

- `e2e.yml` runs Playwright (~6 min) on every push to `develop` that touches web/packages/supabase. On a PR it runs **only when the PR has the `e2e` label**: add the label when a PR changes user flows, pages or RLS, and it re-runs on each push while the label stays. It can also be started by hand (Actions → E2E → Run workflow). Without the label the PR check shows as skipped.
- It starts a **local** Supabase in the runner (only db, auth, rest and kong), builds the web app against it and serves it on :3200. Nothing touches staging, and no secrets are needed.
- Google can't be automated, so tests create real users with the local service role and sign them in through the admin API (`apps/web/e2e/support/local-supabase.ts`). Keys come from `supabase status`, and the helper refuses to run against a non-local URL.
- Run locally: `supabase start` (repo root), then `pnpm --filter @prepora/web e2e`. A failed CI run uploads the Playwright report and traces as an artifact.

## Shared pieces

- `.github/actions/cloudflare-preflight`: checks the token can manage Workers in the account and can see the `prepora.site` zone; readable errors, never prints the token.
- Secrets (environment `staging`): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`.
- Repository variables (public, baked into the web build): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Repository variables for monitoring (M0-I2, optional, unset = off): `SENTRY_DSN_WEB`, `SENTRY_DSN_ADMIN`, `POSTHOG_KEY`, `POSTHOG_HOST`. Deploy and preview steps also pass `SENTRY_DSN` and `SENTRY_RELEASE` to the Worker with `--var`, and previews additionally get `APP_ENV=preview`. See [observability.md](observability.md).
- Dependency rule: pnpm 12 and Deno 2 refuse packages published < 24 h ago; pin older versions and commit lockfiles.
