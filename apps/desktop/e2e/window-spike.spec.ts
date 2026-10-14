import { test, expect } from "./fixtures.ts";
import { _electron as electron } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDirs } from "./helpers.ts";

// The M0 window spike (WP-0.6, D-14): a transparent, frameless window can be created and drawn
// on Windows and Linux. Since M2 (WP-2.1) it's the window there, with app-built window management (m2-window.spec.ts).
test("window spike: the custom window opens transparent and frameless", async () => {
  test.skip(process.platform === "darwin", "macOS uses the native window (D-14)");
  const dirs = tempDirs();
  // Past the first run, as someone who already set up (FRE-01).
  writeFileSync(join(dirs.userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  const app = await electron.launch({
    args: [join(import.meta.dirname, "..", "out", "main", "main.mjs")],
    env: { ...process.env, FOCUS_NOTES_USER_DATA: dirs.userData, FOCUS_NOTES_DOCS: dirs.docs, FOCUS_NOTES_E2E: "1" } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
  const info = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { bg: w.getBackgroundColor(), resizable: w.isResizable(), bounds: w.getBounds() };
  });
  expect(info.bg.toLowerCase()).toMatch(/^#00000000$|^#0{6}$/);
  await page.screenshot({ path: "../../test-results/screens/window-spike.png" });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await app.waitForEvent("close", { timeout: 10_000 }).catch(() => {});
  console.log(`window spike: ${JSON.stringify(info)}`);
});
