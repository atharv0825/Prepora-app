# Auth: Google only (M1-B1)

Prepora signs people **in and up with Google only**. The email provider is turned off, so there is no email code, no magic link and no password. This was the user's decision on 2026-11-22, replacing the email OTP option in plan.md.

Shared values live in `packages/shared/src/constants/auth.ts`:
- `AUTH_PROVIDER` = `"google"`
- `AUTH_CALLBACK_PATH` = `/auth/callback`
- `DEFAULT_NEXT_PATH`
- `safeNextPath()` and `authCallbackUrl()`

`tests/contract.test.ts` checks `supabase/config.toml`:
- Sign-up is open.
- Email is off.
- Google is the *only* enabled method, and its secret comes from the environment.

## Flow

`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: authCallbackUrl(origin, next) } })` sends the browser to Google. Google returns to Supabase (`https://<ref>.supabase.co/auth/v1/callback`), and Supabase redirects to `<origin>/auth/callback?code=…&next=…`. That route (M1-F1 for web, M1-A1 for admin) exchanges the code for a session (PKCE) and goes to the safe `next`.

- **Sign-up and sign-in are the same button.** A first Google sign-in creates the `auth.users` row; M1-B2's trigger then creates the profile. The app can tell the two apart (for `signup_completed` vs `login_completed`) by whether the profile was just created.
- **Redirect allowlist:** Supabase only redirects to allowed URLs; anything else falls back to the Site URL. This was tested locally: `https://evil.example/…` and `http://localhost:3000.evil.example/…` both fell back.
- **Tests and seed data** can't click through Google. They create users with the service role (`auth.admin.createUser`), which still works with email sign-in off.

## Settings per environment

Each environment uses its own Supabase project. PR previews share **staging**.

### Local (`supabase start`), set in `supabase/config.toml`
- **Site URL:** `http://localhost:3000`
- **Redirect allowlist:**
  - `http://localhost:3000/**` and `http://127.0.0.1:3000/**` (web)
  - `http://localhost:3001/**` and `http://127.0.0.1:3001/**` (admin)
- **Email provider:** off (`[auth.email] enable_signup = false`).
- **Google:** credentials come from `supabase/.env` (copy `supabase/.env.example`). The Google OAuth client must list `http://127.0.0.1:54321/auth/v1/callback` under *Authorized redirect URIs*. Without these credentials, nobody can sign in locally through the UI.

### Staging: project `xvaxqiumdmgdvmbsqcub`, set in the Supabase dashboard
1. **Authentication → URL Configuration**
   - **Site URL:** `https://staging.prepora.site`
   - **Redirect URLs:** add each of these:
     - `https://staging.prepora.site/**`
     - `https://admin-staging.prepora.site/**`
     - `https://pr-*-prepora-web-staging.<subdomain>.workers.dev/**` (PR previews, web)
     - `https://pr-*-prepora-admin-staging.<subdomain>.workers.dev/**` (PR previews, admin)

     `<subdomain>` is the account's workers.dev subdomain (Workers & Pages → "Your subdomain"). **Don't** use `*` in its place: anyone can register their own workers.dev subdomain and a Worker with a matching name, which would let them receive users' Google sign-in redirects (and with them, sessions).
2. **Authentication → Sign In / Providers**
   - **Google:** enabled. This is already done: the public settings endpoint reports `google: true`.
   - **Email:** **turn off**. It's currently on (`email: true`), which would still let anyone create an account with an email code through the API.
   - "Allow new users to sign up" stays **on**, because Google sign-up needs it.
3. **Google Cloud Console → Credentials → OAuth client → Authorized redirect URIs:** `https://xvaxqiumdmgdvmbsqcub.supabase.co/auth/v1/callback`. Supabase sends this URI; it was checked on staging's authorize redirect.

### Production (Supabase project created at launch, M13)
- **Site URL:** `https://prepora.site`
- **Redirect URLs:** `https://prepora.site/**`, `https://www.prepora.site/**`, `https://admin.prepora.site/**`. No previews and no localhost.
- **Providers:** Google on, Email off.
- **Google:** a production OAuth client (or the same one) with `https://<prod-ref>.supabase.co/auth/v1/callback`. Publish the OAuth consent screen ("In production") with Prepora's name, logo, privacy policy and terms; Google may need to verify the brand. **While the consent screen is in "Testing", only listed test users can sign in, and with Google as the only method, that means nobody else can.**
