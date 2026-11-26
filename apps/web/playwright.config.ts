import { defineConfig, devices } from "@playwright/test";
import { localSupabase } from "./e2e/support/local-supabase";

// End-to-end tests (M1-I1) against LOCAL Supabase only (see e2e/support/local-supabase.ts).
//
//   supabase start                 # repo root
//   pnpm --filter @prepora/web e2e
//
// The app is built and served on :3200 with the local Supabase URL and publishable key, so it
// never touches staging and doesn't clash with `next dev` on :3000. In CI the same happens
// (.github/workflows/e2e.yml).

const PORT = 3200;
const supabase = localSupabase();

const FAKE_MIC = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Two workers: the signed-in tests each create users and go through Supabase Auth, and more
  // parallelism made them time out on small machines (a dev laptop, a CI runner).
  workers: 2,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // M7-F1: a fake microphone (a steady beep) so Speaking's mic test and recorder run headless.
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { args: FAKE_MIC } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { args: FAKE_MIC } } },
    // M5-I1: Safari on iPhone (WebKit with an iPhone profile) for Listening playback rules.
    { name: "ios-safari", use: { ...devices["iPhone 15"] }, testMatch: /listening-live\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
