import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, quit, tempDirs } from "./helpers.ts";

// Focus mode for visual review: only the caret's visual row is at full strength.
test("screens: focus mode", async () => {
  const dirs = tempDirs();
  const p = "Focus mode keeps the row you are writing at full strength and dims everything else, so attention stays on the sentence in front of you while the rest of the page waits quietly.";
  writeFileSync(join(dirs.docs, "Welcome.md"), `# A calm page\n\n${p}\n\n${p} ${p}\n\n- one idea\n- another idea\n\n${p}\n`);
  const l = await launch(dirs);
  const { page } = l;
  const editor = page.getByRole("textbox", { name: "Note" });
  await editor.waitFor();
  await editor.locator("p").nth(1).click({ position: { x: 200, y: 40 } });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "../../test-results/screens/focus-light.png" });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+L" : "Control+Shift+L");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "../../test-results/screens/focus-dark.png" });
  await quit(l);
});
