import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/desktop",
  // Approved visual baselines (DSY-09): only the owner adds one, in a reviewed commit. Candidates go
  // to test-results/baselines/candidates (baselines.spec.ts), never here.
  snapshotPathTemplate: "{testDir}/baselines/{platform}/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
});
