import { defineConfig } from "@playwright/test";

// Browser journeys against the built site (MW). GitHub is faked at the network layer.
export default defineConfig({
  testDir: "e2e",
  outputDir: "../../test-results/web",
  timeout: 60_000,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4317/",
    browserName: "chromium",
    // Locally the installed Edge; in CI the Chromium that Playwright installs.
    ...(process.env.CI ? {} : { channel: "msedge" }),
    viewport: { width: 1100, height: 780 },
  },
  webServer: {
    command: "pnpm exec vite preview --config vite.config.ts --port 4317 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4317/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
