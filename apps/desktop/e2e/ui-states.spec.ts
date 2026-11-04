import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
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
    await expect(settings.getByText("Couldn't save this choice. Try again or revert.", { exact: true })).toBeVisible();
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

test("theme-manager appearance and paragraph choices retain failures and retry without blocking the other group", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", appearance: "light" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const mode = theme.getByRole("radiogroup", { name: "Appearance", exact: true });
    block();
    await mode.getByText("Dark", { exact: true }).click();
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mode.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    restore();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    const spacing = theme.getByRole("radiogroup", { name: "Paragraph spacing", exact: true });
    await spacing.getByText("Airy", { exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).paragraphSpacing).toBe("airy");
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).appearance).toBe("dark");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "ink");
    await expect(spacing.locator("..")).not.toHaveAttribute("data-commit", "pending");
    block();
    await spacing.getByText("Compact", { exact: true }).click();
    await expect(spacing.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
    const retries = theme.getByRole("button", { name: "Retry", exact: true });
    await expect(retries).toHaveCount(1);
    await expect(retries).toBeVisible();
    restore();
    await retries.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).paragraphSpacing).toBe("compact");
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(mode.getByRole("radio", { name: "Dark", exact: true })).toBeChecked();
    await expect(spacing.getByRole("radio", { name: "Compact", exact: true })).toBeChecked();
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("reading sliders preview keyboard changes, retain failed values, retry and reopen stored settings", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", appearance: "light", measure: 70 }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
      await l.page.getByRole("tab", { name: "Reading", exact: true }).click();
    };
    await open();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const width = theme.getByRole("slider", { name: "Reading width", exact: true });
    await width.focus();
    await width.press("ArrowRight");
    await width.press("ArrowRight");
    expect(JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(70);
    await expect(theme.getByText("80 characters", { exact: true })).toBeVisible();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(80);
    await expect(width).toBeFocused();
    await expect(width.locator("xpath=ancestor::*[@data-commit][1]")).not.toHaveAttribute("data-commit", "pending");
    renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await width.press("ArrowRight");
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(width).toHaveValue("85");
    await expect(theme.getByText("85 characters", { exact: true })).toBeVisible();
    restore();
    const line = theme.getByRole("slider", { name: "Line spacing", exact: true });
    await line.focus();
    await line.press("End");
    await line.press("Tab");
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).lineHeight).toBe(2);
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).measure).toBe(85);
    const dim = theme.getByRole("slider", { name: "Focus dim", exact: true });
    await dim.focus();
    await dim.press("End");
    await dim.press("Tab");
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).focusDim).toBe(0.6);
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await expect(width).toHaveValue("85");
    await expect(line).toHaveValue("2");
    await expect(dim).toHaveValue("0.6");
  } finally { restore(); await closeTestApp(l); }
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
    const savedNotice = l.page.getByRole("status").filter({ hasText: "Name saved." });
    await expect(savedNotice).toHaveCount(0);
    rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.name).toBe("Kept project draft");
    await expect(savedNotice).toHaveText("Name saved.");
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

test("project colour and logo keep failed choices, retry the latest value and revert without writing", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const blue = settings.getByRole("button", { name: "Blue", exact: true });
    const red = settings.getByRole("button", { name: "Red", exact: true });
    block();
    await blue.click();
    await expect(blue).toHaveAttribute("data-commit", "failed");
    await expect(blue).toHaveAttribute("aria-pressed", "true");
    await red.click();
    await expect(red).toHaveAttribute("data-commit", "failed");
    await expect(blue).toHaveAttribute("aria-pressed", "false");
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(red).toHaveAttribute("data-commit", "failed");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.accent).toBe("red");
    const rocket = settings.getByRole("button", { name: "Rocket", exact: true });
    await rocket.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.logo).toBe("rocket");
    block();
    const star = settings.getByRole("button", { name: "Star", exact: true });
    await star.click();
    await expect(star).toHaveAttribute("data-commit", "failed");
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(rocket).toHaveAttribute("aria-pressed", "true");
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
    expect(statSync(stateFile).isDirectory()).toBe(true);
    restore();
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("project font and theme retain failed choices on their triggers and keep keyboard preview separate from saving", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs];
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const font = settings.getByRole("button", { name: /^Font:/ });
    await font.click();
    const fonts = l.page.getByRole("dialog", { name: "Font", exact: true });
    block();
    await fonts.getByRole("button", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(fonts).not.toBeVisible();
    await expect(font).toHaveAttribute("data-commit", "failed");
    await expect(font).toHaveAccessibleName("Font: Serif (Fraunces and Newsreader)");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved()?.font).toBe("serif");
    const theme = settings.getByRole("button", { name: /^Theme:/ });
    await theme.click();
    const themes = l.page.getByRole("dialog", { name: "Colour theme", exact: true });
    const sepia = themes.getByRole("option", { name: /^Sepia/ });
    await sepia.focus();
    await sepia.press("ArrowRight");
    expect(saved()?.theme).toBe("app");
    block();
    await sepia.click();
    await expect(themes).not.toBeVisible();
    await expect(theme).toHaveAttribute("data-commit", "failed");
    await expect(theme).toHaveAccessibleName("Theme: Sepia");
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved()?.theme).toBe("sepia");
    await expect(theme).not.toHaveAttribute("data-commit", "pending");
    await theme.click();
    await themes.getByRole("button", { name: "Use app default", exact: true }).click();
    await expect.poll(() => saved()?.theme).toBe("app");
    expect(saved()?.font).toBe("serif");
    await expect(theme).toHaveAccessibleName("Theme: App default");
  } finally {
    restore();
    await closeTestApp(l);
  }
});

test("a refused watermark change keeps the writing surface unchanged and Retry/Revert preserve its last saved value", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const watermark = settings.getByRole("radiogroup", { name: "Watermark", exact: true });
    const mark = l.page.locator('[data-project-mark="watermark"]');
    await expect(mark).toHaveCount(0);
    block();
    await watermark.getByText("On", { exact: true }).click();
    await expect(watermark.getByRole("radio", { name: "On", exact: true })).toBeChecked();
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(0);
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.watermark).toBe("on");
    await expect(mark).toHaveCount(1);
    await expect(watermark.locator("..")).not.toHaveAttribute("data-commit", "pending");
    block();
    await watermark.getByText("Off", { exact: true }).click();
    await expect(settings.getByRole("button", { name: "Revert", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(1);
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(watermark.getByRole("radio", { name: "On", exact: true })).toBeChecked();
    await expect(mark).toHaveCount(1);
    expect(statSync(stateFile).isDirectory()).toBe(true);
    restore();
  } finally {
    restore();
    await closeTestApp(l);
  }
});
