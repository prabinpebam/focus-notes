import { defineConfig } from "@playwright/test";

// Immutable-package journeys use *-package.spec.ts, never the ordinary source CI gate.
// Explicit opt-in (set FOCUS_NOTES_E2E=1 and FOCUS_NOTES_E2E_EXE to the exact prebuilt
// executable required by each fixture; its identity/hash assertions remain mandatory):
// pnpm --filter @focus-notes/desktop exec playwright test --config playwright.package.config.ts
// Add --list to inspect discovery without launching an app or requiring package variables.
// Select a specific e2e/*-package.spec.ts when fixtures require different frozen builds.
export const packageJourneyPattern = /-package\.spec\.ts$/;

export default defineConfig({
  testDir: "e2e",
  testIgnore: packageJourneyPattern,
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
