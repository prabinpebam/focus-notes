import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs } from "./helpers.ts";

test("a rejected settings write is reported and Retry persists the requested value", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    const scale = settings.getByRole("radiogroup", { name: "Interface size", exact: true });
    const larger = scale.getByRole("radio", { name: "110%", exact: true });
    await expect(larger).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await scale.getByText("110%", { exact: true }).click();
    await expect(l.page.getByText("Couldn’t complete this action. Review the result, then try again.", { exact: true })).toBeVisible();
    await expect(larger).not.toBeChecked();
    const retry = l.page.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await l.page.keyboard.press("F6");
    await expect(retry).toBeFocused();
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).uiScale).toBe(1.1);
    await expect(settings).toBeVisible();
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await expect(settings).not.toBeVisible();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await expect(larger).toBeChecked();
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    try {
      await quit(l);
    } finally {
      if (process.platform === "win32") {
        const cleanup = fileURLToPath(new URL("../../../tools/dev/close-test-apps.ps1", import.meta.url));
        for (const flags of [["-WhatIf"], []]) {
          execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", String(l.pid), ...flags], { stdio: "inherit" });
        }
      }
    }
  }
});
