import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import pkg from "./package.json" with { type: "json" };

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

const nextConfig: NextConfig = {
  // @prepora/ui ships TypeScript source; let Next compile it.
  transpilePackages: ["@prepora/ui", "@prepora/shared"],
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_COMMIT_SHA: commitSha(),
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

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings via getCloudflareContext().
initOpenNextCloudflareForDev();
