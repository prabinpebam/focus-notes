import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/*/test/**/*.test.ts", "tools/test/**/*.test.mjs"],
    environment: "node",
    // File-heavy and key-derivation tests share CPU when files run in parallel; on a slow CI
    // runner vitest's 5 s default times them out. Budgets are asserted by the tests themselves.
    testTimeout: 20_000,
  },
});