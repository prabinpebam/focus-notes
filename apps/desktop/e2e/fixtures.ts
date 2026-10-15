/**
 * The journeys' `test`: Playwright's, with one automatic fixture that kills any app a journey left
 * running once it ends (`killLeftovers`), so a failure never stalls the worker or leaks into the
 * next journey. Everything else is Playwright's own.
 */
import { test as base } from "@playwright/test";
import { killLeftovers } from "./helpers.ts";

export * from "@playwright/test";

/**
 * Whether journeys may maximize, snap, full-screen, or resize the real window (D-141): on CI, or
 * locally with `FOCUS_NOTES_E2E_ALLOW_SCREEN=1`. On the owner's computer they'd cover their apps.
 */
export const screenAllowed = (env: NodeJS.ProcessEnv = process.env): boolean => Boolean(env.CI) || env.FOCUS_NOTES_E2E_ALLOW_SCREEN === "1";
export const SCREEN_SKIP = "Screen-level journey (maximizes, snaps, goes full screen or resizes the real window): runs on CI, or locally with FOCUS_NOTES_E2E_ALLOW_SCREEN=1 (D-141)";

export const test = base.extend<{ leftovers: void }>({
  leftovers: [
    async ({}, use) => {
      await use();
      killLeftovers();
    },
    { auto: true },
  ],
});