# Auth: Google OAuth and email OTP (M1-B1)

Users sign in in one of two ways:
- **Continue with Google** (OAuth with PKCE).
- **Email code:** the user enters their email, receives a 6-digit code, and types it in.

There are no passwords and no magic links. Shared values live in `packages/shared/src/constants/auth.ts`:
- `OTP_LENGTH`, `OTP_EXPIRY_SECONDS`, `OTP_RESEND_SECONDS`
- `AUTH_CALLBACK_PATH` = `/auth/callback`
- `safeNextPath()` and `authCallbackUrl()`

A contract test (`tests/contract.test.ts`) checks these against `supabase/config.toml`.

## Flows

**Email OTP.** `supabase.auth.signInWithOtp({ email })` sends the code: new users get the *Confirm signup* email, existing users get the *Magic Link* email. Both templates contain `{{ .Token }}`. The app then calls `supabase.auth.verifyOtp({ email, token, type: "email" })`. No redirect is involved.

**Google.** `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authCallbackUrl(origin, next) } })` sends the browser to Google. Google returns to Supabase (`https://<ref>.supabase.co/auth/v1/callback`), and Supabase redirects to `<origin>/auth/callback?code=…&next=…`. That route (M1-F1 for web, M1-A1 for admin) exchanges the code and then goes to the safe `next`.

Supabase only redirects to URLs on the project's **redirect allowlist**. Anything else falls back to the Site URL. This was tested locally: `https://evil.example/…` and `http://localhost:3000.evil.example/…` both fell back to the Site URL.

## Settings per environment

Each environment uses its own Supabase project. Preview deployments share **staging**.

### Local (`supabase start`), set in `supabase/config.toml`
- **Site URL:** `http://localhost:3000`
- **Redirect allowlist:**
  - `http://localhost:3000/**` and `http://127.0.0.1:3000/**` (web)
  - `http://localhost:3001/**` and `http://127.0.0.1:3001/**` (admin)
- **Email OTP:**
  - 6 digits, valid for 600 s, resend allowed after 60 s.
  - Emails go to Mailpit at http://127.0.0.1:54324.
- **Google:** credentials come from `supabase/.env` (copy `supabase/.env.example`). Add `http://127.0.0.1:54321/auth/v1/callback` to the Google client's *Authorized redirect URIs*. Without these credentials, local Google sign-in fails but email OTP still works.

### Staging: project `xvaxqiumdmgdvmbsqcub`, set in the Supabase dashboard
1. **Authentication → URL Configuration**
   - **Site URL:** `https://staging.prepora.site`
   - **Redirect URLs:** add each of these:
     - `https://staging.prepora.site/**`
     - `https://admin-staging.prepora.site/**`
     - `https://pr-*-prepora-web-staging.<subdomain>.workers.dev/**` (PR previews, web)
     - `https://pr-*-prepora-admin-staging.<subdomain>.workers.dev/**` (PR previews, admin)

     `<subdomain>` is the account's workers.dev subdomain (Workers & Pages → "Your subdomain"). **Don't** use `*` in its place: anyone can register their own workers.dev subdomain and a Worker with a matching name, which would let them receive users' Google sign-in redirects (and with them, sessions).
2. **Authentication → Sign In / Providers → Email:** enabled, "Allow new users to sign up" on. Set **Email OTP Length 6** and **Email OTP Expiration 600** seconds.
3. **Authentication → Sign In / Providers → Google:** enabled. This is already done: the public settings endpoint reports `google: true`.
4. **Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs:** `https://xvaxqiumdmgdvmbsqcub.supabase.co/auth/v1/callback`. Supabase sends this URI; it was checked on staging's authorize redirect.
5. **Authentication → Email Templates:**
   - In **Confirm signup** and **Magic Link**, replace the body with the contents of `supabase/templates/otp-code.html`. It contains `{{ .Token }}`; without it the email carries a link instead of a code.
   - Set the subject to "Your Prepora sign-in code".
   - Branded versions come in M1-B4.
6. Note: until custom SMTP is set up (M1-B4), Supabase's built-in mailer sends only a few emails per hour, which is enough for testing.

### Production (Supabase project created at launch, M13)
- **Site URL:** `https://prepora.site`
- **Redirect URLs:** `https://prepora.site/**`, `https://www.prepora.site/**`, `https://admin.prepora.site/**`. No previews and no localhost.
- Same Email OTP settings and templates as staging.
- Google: a production OAuth client (or the same one) with `https://<prod-ref>.supabase.co/auth/v1/callback`. Publish the OAuth consent screen ("In production") with Prepora's name, logo, privacy policy and terms; Google may need to verify the brand. While in "Testing", only listed test users can sign in.
