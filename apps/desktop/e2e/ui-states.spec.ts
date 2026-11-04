import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { test, expect } from "./fixtures.ts";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";

async function closeTestApp(l: Launched) {
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
    await expect(settings.getByText("Couldn't save this change. What you typed is still here.", { exact: true })).toBeVisible();
    await expect(larger).toBeChecked();
    const retry = settings.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
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
    await closeTestApp(l);
  }
});

test("notification Retry stays above Settings and reachable with F6 while the modal stays open", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+=" : "Control+=");
    const retry = l.page.getByRole("region", { name: "Notifications", exact: true }).getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await l.page.keyboard.press("F6");
    await expect(retry).toBeFocused();
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).fontSize).toBeGreaterThan(16);
    await expect(settings).toBeVisible();
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await closeTestApp(l);
  }
});

test("project name saves on blur, keeps a rejected draft and retries without losing focus or input", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const name = settings.getByRole("textbox", { name: "Name", exact: true });
    await expect(name).toBeVisible();
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await name.fill("Kept project draft");
    await expect(name).toBeEditable();
    await name.press("Tab");
    await expect(settings.getByText("Couldn't save this change. What you typed is still here.", { exact: true })).toBeVisible();
    await expect(name).toHaveValue("Kept project draft");
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.name).toBe("Kept project draft");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await expect(name).toHaveValue("Kept project draft");
  } finally {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await closeTestApp(l);
  }
});
