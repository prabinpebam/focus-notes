import { defineConfig } from "@playwright/test";

// Browser journeys against the built site (MW), published with the fixture instance in e2e/fixture:
// public notes, and private notes sealed for the test passphrase (D-90).
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
    // Never a window on the person's screen, nor their focus (D-104 (7)).
    headless: true,
    viewport: { width: 1100, height: 780 },
  },
  webServer: {
    command: "node ../../packages/seal/src/cli.ts publish --site dist --notes e2e/fixture/notes --private e2e/fixture/private --reader dist-reader --owner octo && pnpm exec vite preview --config vite.config.ts --port 4317 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4317/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
