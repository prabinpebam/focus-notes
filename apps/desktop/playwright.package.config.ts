import { defineConfig } from "@playwright/test";
import source, { packageJourneyPattern } from "./playwright.config.ts";

// Separate evidence lane; do not skip or relax a fixture's exact-package identity checks.
export default defineConfig({
  ...source,
  testIgnore: [],
  testMatch: packageJourneyPattern,
  outputDir: "../../test-results/desktop-package",
});
