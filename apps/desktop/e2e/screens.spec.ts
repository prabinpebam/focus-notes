import { test } from "@playwright/test";
import { launch, quit, tempDirs } from "./helpers.ts";

// Captures the canvas in light and dark for visual review and baselines.
test("screens: canvas light and dark", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  await l.page.getByRole("textbox", { name: "Note" }).waitFor();
  await l.page.waitForTimeout(400);
  await l.page.screenshot({ path: "../../test-results/screens/canvas-light.png" });
  await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+L" : "Control+Shift+L");
  await l.page.waitForTimeout(400);
  await l.page.screenshot({ path: "../../test-results/screens/canvas-dark.png" });
  await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
  await l.page.getByRole("toolbar", { name: "Toolbar" }).waitFor();
  await l.page.waitForTimeout(300);
  await l.page.screenshot({ path: "../../test-results/screens/toolbar-dark.png" });
  await l.page.getByRole("button", { name: "More" }).click();
  await l.page.getByRole("menu", { name: "More" }).waitFor();
  await l.page.waitForTimeout(300);
  await l.page.screenshot({ path: "../../test-results/screens/more-menu-dark.png" });
  await l.page.keyboard.press("Escape");
  await l.page.keyboard.press("Escape");
  await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+L" : "Control+Shift+L");
  await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
  await l.page.waitForTimeout(400);
  await l.page.screenshot({ path: "../../test-results/screens/toolbar-light.png" });
  await quit(l);
});
