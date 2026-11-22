# Observability: Sentry and PostHog (M0-I2)

Everything is wired in code and **switched off until the keys exist**. With no keys, or on
localhost, nothing is sent. No PostHog events are captured yet: the typed list lives in
`packages/shared/src/analytics.ts`, and each milestone starts sending its own events.

## What runs where

| Surface | Sentry | PostHog |
|---|---|---|
| Web, browser | `apps/web/src/instrumentation-client.ts` (`@sentry/nextjs`) | same file (`posthog-js`), autocapture/pageviews/replay off, memory persistence |
| Web, server (Worker) | `apps/web/worker.mjs` → `withSentry` wraps the OpenNext worker; `src/instrumentation.ts` `onRequestError` | none |
| Admin, browser + server | same pattern as web (`apps/admin/...`) | none (staff aren't tracked) |
| Edge Functions | `supabase/functions/_shared/sentry.ts` (M0-B3) | none |
| Error pages | `error.tsx` / `global-error.tsx` → `captureException` | none |

- **Environment:** taken from the hostname (`packages/shared/src/observability.ts`): `localhost` → development (SDKs off), `*.workers.dev` → preview, `staging.*` / `admin-staging.*` → staging, everything else → production. On the Worker it's `APP_ENV`, and PR previews are uploaded with `APP_ENV=preview`.
- **Release:** `prepora-<app>@<package version>+<sha7>`, the same string in the browser (`NEXT_PUBLIC_SENTRY_RELEASE`) and the Worker (`--var SENTRY_RELEASE`).
- **Privacy:** Sentry's `dataCollection` turns off automatic user info, cookies, HTTP bodies and query strings. We set the user id ourselves after login (M1-F4). PostHog keeps nothing in cookies or localStorage until the cookie notice exists.
- **Worker size:** the server side imports `@sentry/core`, not `@sentry/nextjs`. The Next.js Node SDK added about 1.3 MB gzipped per Worker, which nearly hits the free plan's 3 MB. `@sentry/core` reports through the client that `withSentry` creates, because the SDK keeps the active client on a global shared by every copy of the same version. **Keep all `@sentry/*` packages on the same exact version.**

## One-time setup

### Sentry (free Developer plan)
1. Create an organisation, then three **projects**:
   - `prepora-web` (platform: Next.js)
   - `prepora-admin` (platform: Next.js)
   - `prepora-functions` (platform: Deno)
2. Copy each project's **DSN** from Project Settings → Client Keys (DSN). DSNs are public by design: they only allow *sending* events.
3. In GitHub, go to Settings → Secrets and variables → Actions → **Variables** and add:
   - `SENTRY_DSN_WEB`: the prepora-web DSN.
   - `SENTRY_DSN_ADMIN`: the prepora-admin DSN.
4. Give Edge Functions their DSN by running this yourself, from a terminal logged in to Supabase:
   `supabase secrets set SENTRY_DSN=<prepora-functions DSN> --project-ref <staging ref>`
5. Recommended: in each project, set an alert rule for new issues to email you.
6. Later, in the release workflow (plan §9), add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` as secrets for source-map upload. Until then, stack traces are minified.

### PostHog (Cloud, free tier)
1. Create a project named `Prepora`, and pick a region (US or EU). The region can't be changed later.
2. Copy the **Project API key** (`phc_…`), which is public.
3. Add GitHub repository **variables**:
   - `POSTHOG_KEY`: the `phc_…` key.
   - `POSTHOG_HOST`: `https://us.i.posthog.com` or `https://eu.i.posthog.com`. If left empty, the code falls back to US.
4. In Project settings, turn off **autocapture** and **session replay** on the server side as well (belt and braces).

The browser keys are baked into the build. After adding or changing variables, re-run the **Web** and **Admin** workflows on `develop` (Actions → workflow → Run workflow).

## Checking it's connected
- **Keys baked in:** on staging, open DevTools → Sources and search the JS for `ingest.sentry.io` (DSN) and `phc_` (PostHog key). If they're missing, the variables weren't set when that build ran.
- **First Sentry event:** none is sent until something actually breaks. Sentry ignores errors thrown from the DevTools console, so a console test won't arrive. If you want proof earlier, add a temporary route that throws, deploy it to staging, and check the Sentry project.
- **First PostHog event:** arrives with the first `track()` call (from M1). PostHog → Activity.
