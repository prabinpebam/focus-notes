/**
 * The journeys' `test`: Playwright's, with one automatic fixture that kills any app a journey left
 * running once it ends (`killLeftovers`), so a failure never stalls the worker or leaks into the
 * next journey. Everything else is Playwright's own.
 */
import { test as base } from "@playwright/test";
import { killLeftovers } from "./helpers.ts";

export * from "@playwright/test";

export const test = base.extend<{ leftovers: void }>({
  leftovers: [
    async ({}, use) => {
      await use();
      killLeftovers();
    },
    { auto: true },
  ],
});