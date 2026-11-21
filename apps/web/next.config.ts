import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  // @prepora/ui ships TypeScript source; let Next compile it.
  transpilePackages: ["@prepora/ui"],
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
