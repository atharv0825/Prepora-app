import { defineConfig } from "vitest/config";

// Unit tests for the whole monorepo (M0-I1). Run: pnpm test
// Tests sit next to the code as *.test.ts and use relative imports (no app path aliases).
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
