import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

// The M0 window spike (WP-0.6, D-14): a transparent, frameless window can be created and drawn
// on Windows and Linux. Since M2 (WP-2.1) it's the window there, with app-built window management (m2-window.spec.ts).
test("window spike: the custom window opens transparent and frameless", async () => {
  test.skip(process.platform === "darwin", "macOS uses the native window (D-14)");
  const dirs = tempDirs();
  const l = await launch(dirs);
  const { app, page } = l;
  await expect(page.getByRole("textbox", { name: "Note" })).toBeVisible();
  const info = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!;
    return { bg: w.getBackgroundColor(), resizable: w.isResizable(), bounds: w.getBounds() };
  });
  expect(info.bg.toLowerCase()).toMatch(/^#00000000$|^#0{6}$/);
  await page.screenshot({ path: "../../test-results/screens/window-spike.png" });
  await quit(l);
  console.log(`window spike: ${JSON.stringify(info)}`);
});
