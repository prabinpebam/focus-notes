import { test, expect } from "./fixtures.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SyncReport } from "@focus-notes/core";
import { launch, quit, tempDirs } from "./helpers.ts";

async function start() {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  const l = await launch(dirs);
  await expect(l.page.getByRole("textbox", { name: "Note" })).toBeFocused();
  await expect(l.page.locator("#saveState")).toBeVisible();
  return l;
}

test("UI-12: an outlined icon replaces the desktop name; its hover card does not steal writing focus", async () => {
  const l = await start();
  const { page } = l;
  try {
    const icon = page.locator("#saveState");
    const shape = await icon.evaluate((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height, border: s.borderTopColor, radius: parseFloat(s.borderRadius) };
    });
    expect(Math.abs(shape.width - shape.height)).toBeLessThan(1);
    expect(shape.border).not.toBe("rgba(0, 0, 0, 0)");
    expect(shape.radius).toBeGreaterThanOrEqual(shape.height / 2);
    const inset = await icon.evaluate((el) => {
      const window = document.querySelector("[data-app-root]")!.getBoundingClientRect();
      const icon = el.getBoundingClientRect();
      return { left: icon.left - window.left, bottom: window.bottom - icon.bottom };
    });
    expect(inset.left).toBeGreaterThan(0);
    expect(Math.abs(inset.left - inset.bottom)).toBeLessThan(1);
    await expect(page.locator("#account")).toHaveText("");
    await icon.hover();
    const card = page.getByRole("dialog", { name: "Backup", exact: true });
    await expect(card).toBeVisible();
    await expect.poll(async () => {
      const mark = await card.locator("[data-step-mark-size=compact]").boundingBox();
      return { width: mark?.width, height: mark?.height };
    }).toEqual({ width: 36, height: 36 });
    expect(await card.evaluate((el) => {
      const s = getComputedStyle(el.closest("[data-surface=popover]")!);
      return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    })).toEqual(["16px", "16px", "16px", "16px"]);
    // At the window edge, the popover may shift inward to preserve its boundary padding.
    await expect.poll(async () => {
      const left = await card.evaluate((el) => el.closest("[data-surface=popover]")!.getBoundingClientRect().left);
      const trigger = (await icon.boundingBox())!;
      return Math.abs(left - trigger.x) <= trigger.width;
    }).toBe(true);
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    await expect(card).toContainText("No backup recorded in this session");
    await expect(card.getByRole("button", { name: "Backup to GitHub", exact: true })).toBeDisabled();
    await card.hover();
    await page.waitForTimeout(700);
    await expect(card).toBeVisible();
  } finally { await quit(l); }
});

test("EDT-11: the open card and border ring track backup, including reopening mid-backup and reduced motion", async () => {
  const l = await start();
  const { page, app } = l;
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
      ipcMain.removeHandler("sync:now");
      ipcMain.handle("sync:now", () => {
        win.webContents.send("sync:status", { git: true, state: "syncing", waiting: 2 });
        return new Promise<SyncReport>((resolve) => {
          (globalThis as typeof globalThis & { finishBackup?: () => void }).finishBackup = () => {
            const report: SyncReport = { git: true, state: "idle", waiting: 0 };
            win.webContents.send("sync:status", report);
            resolve(report);
          };
        });
      });
      win.webContents.send("sync:status", { git: true, state: "idle", waiting: 0 });
    });
    const icon = page.locator("#saveState");
    await page.mouse.move(500, 300);
    await icon.hover();
    const card = page.getByRole("dialog", { name: "Backup", exact: true });
    await expect(card).toBeVisible();
    const backup = card.getByRole("button", { name: "Backup to GitHub", exact: true });
    // The app's own first status (no Git in this throwaway folder) can land after ours: say it again until it holds.
    await expect(async () => {
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        win.webContents.send("sync:status", { git: true, state: "idle", waiting: 0 });
      });
      await expect(backup).toBeEnabled({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    await backup.click();
    await expect(icon).toHaveAttribute("data-state", "syncing");
    await expect(icon.locator("[data-backup-ring]")).toBeVisible();
    await expect(card).toContainText("Backing up your changes to GitHub");
    await expect(backup).toBeDisabled();
    expect(await icon.locator("[data-backup-ring]").evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
    await page.mouse.move(500, 300);
    await page.keyboard.press("Escape");
    await expect(card).toBeHidden();
    await icon.hover();
    await expect(card).toBeVisible();
    await expect(card).toContainText("Backing up your changes to GitHub");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(() => icon.locator("[data-backup-ring]").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    await app.evaluate(() => (globalThis as typeof globalThis & { finishBackup: () => void }).finishBackup());
    await expect(icon).toHaveAttribute("data-state", "synced");
    await expect(icon.locator("[data-backup-ring]")).toHaveCount(0);
    await expect(card).toContainText("Last backup:");
    await expect(backup).toBeEnabled();
    await page.mouse.move(500, 300);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Tab");
    await icon.focus();
    await page.keyboard.press("Enter");
    await expect(card).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(backup).toBeFocused();
  } finally { await quit(l); }
});

test("UI-12: the circular backup control stays outside pinned Files and returns when unpinned", async () => {
  const l = await start();
  const { page } = l;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const icon = page.locator("#saveState");
    const before = (await icon.boundingBox())!;
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+O`);
    const files = page.getByRole("complementary", { name: "Files" });
    await files.getByRole("button", { name: "Dock Files" }).click();
    await expect.poll(async () => {
      const s = (await files.boundingBox())!;
      const i = (await icon.boundingBox())!;
      const window = await page.locator("[data-app-root]").boundingBox();
      const gap = window!.y + window!.height - before.y - before.height;
      return i.x >= s.x + s.width + gap - 1 || i.y + i.height <= s.y - gap + 1;
    }).toBe(true);
    await icon.hover();
    await expect(page.getByRole("dialog", { name: "Backup", exact: true })).toBeVisible();
    await expect.poll(async () => {
      const left = await page.getByRole("dialog", { name: "Backup", exact: true }).evaluate((el) => el.closest("[data-surface=popover]")!.getBoundingClientRect().left);
      return Math.abs(left - (await icon.boundingBox())!.x);
    }).toBeLessThan(1);
    await page.mouse.move(500, 300);
    await page.keyboard.press("Escape");
    await files.getByRole("button", { name: "Undock Files" }).click();
    await expect.poll(async () => (await icon.boundingBox())!.x).toBe(before.x);
  } finally { await quit(l); }
});
