import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { vanillaExtractPlugin } from "@vanilla-extract/vite-plugin";

export default defineConfig({
  plugins: [react(), vanillaExtractPlugin()],
  test: {
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx", "apps/*/test/**/*.test.ts", "tools/test/**/*.test.mjs"],
    environment: "node",
  },
});