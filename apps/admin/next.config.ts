import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import pkg from "./package.json" with { type: "json" };
import { releaseName } from "../../packages/shared/src/observability";

// Version shown in the sidebar footer: package.json version + short commit SHA.
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
  // Shared packages ship TypeScript source; let Next compile them.
  transpilePackages: ["@prepora/ui", "@prepora/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_COMMIT_SHA: sha,
    NEXT_PUBLIC_SENTRY_RELEASE: releaseName("admin", pkg.version, sha),
  },
  // Reading import: documents up to 10 MB go through a Server Function (default limit 1 MB).
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  // No Cloudflare Images binding (see wrangler.jsonc).
  images: { unoptimized: true },
  // The admin must never be indexed or framed.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
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
