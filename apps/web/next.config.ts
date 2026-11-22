import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import pkg from "./package.json" with { type: "json" };
import { releaseName } from "../../packages/shared/src/observability";

// App version shown in the footer (and later sent to Sentry/PostHog, plan §9):
// package.json version + short commit SHA (GITHUB_SHA in CI, git locally).
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const sha = commitSha();

const nextConfig: NextConfig = {
  // @prepora/ui ships TypeScript source; let Next compile it.
  transpilePackages: ["@prepora/ui", "@prepora/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_COMMIT_SHA: sha,
    NEXT_PUBLIC_SENTRY_RELEASE: releaseName("web", pkg.version, sha),
  },
  // Cache Components (+ Partial Prefetching) are off: OpenNext doesn't fully support them on
  // Cloudflare yet (https://github.com/opennextjs/opennextjs-cloudflare/pull/1318).
  // Re-enable both together once that lands.
  // No Cloudflare Images binding yet (see wrangler.jsonc). Turn optimisation back on with it.
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Sentry build integration (M0-I2). Source-map upload is off until SENTRY_AUTH_TOKEN exists
// (release workflow, plan §9); without it the build doesn't contact Sentry at all.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
  silent: !process.env.CI,
});

// Gives `next dev` access to Cloudflare bindings via getCloudflareContext().
initOpenNextCloudflareForDev();
