/**
 * Account and sync recovery alert journeys (FRE-13, G5.4, D-213, D-408, UC-SAFE-10):
 * verifies every recovery alert card in the built Electron app (corner SaveState + Files header
 * alert + IconLayout two-column geometry + right-aligned actions + offline hard-drive-with-tick),
 * uninterrupted writing during account failure, and real mass-deletion pause + Restore them on disk.
 */
import { test, expect } from "./fixtures.ts";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SyncAlertReport } from "@focus-notes/core";
import { launch, quit } from "./helpers.ts";
import { git, instance } from "./instance.ts";

async function assertTwoColumnIconLayout(card: import("@playwright/test").Locator) {
  const layout = card.locator("[data-icon-layout]").first();
  await expect(layout).toBeVisible();
  const boxes = await layout.evaluate((el) => {
    const icon = el.querySelector("[data-icon-layout-icon]")?.getBoundingClientRect();
    const content = el.querySelector("[data-icon-layout-content]")?.getBoundingClientRect();
    const actions = el.querySelector("[data-icon-layout-actions]")?.getBoundingClientRect();
    const buttons = [...el.querySelectorAll("[data-icon-layout-actions] button")].map((b) => ({
      text: b.textContent?.trim() ?? "",
      rect: b.getBoundingClientRect(),
    }));
    return { icon, content, actions, buttons };
  });
  expect(boxes.icon).toBeTruthy();
  expect(boxes.content).toBeTruthy();
  // Column 1 (icon) sits strictly to the left of column 2 (content); nothing wraps under the icon.
  expect(boxes.icon!.right).toBeLessThanOrEqual(boxes.content!.left + 1);
  // Actions sit at the trailing edge of column 2.
  if (boxes.actions && boxes.buttons.length > 0) {
    const lastBtn = boxes.buttons[boxes.buttons.length - 1]!;
    expect(Math.abs(lastBtn.rect.right - boxes.content!.right)).toBeLessThanOrEqual(4);
  }
}

test("FRE-13 / D-408: recovery alert cards render in corner and Files header with two-column IconLayout while writing continues", async () => {
  const { dirs } = instance();
  const l = await launch(dirs);
  const { page, app } = l;
  try {
    const editor = page.getByRole("textbox", { name: "Note" });
    await expect(editor).toBeFocused();
    const saveState = page.locator("#saveState");
    await expect(saveState).toBeVisible();

    // 1. Offline / local mode: corner uses hardDriveCheck (savedLocal) and normal Backup card uses two-column IconLayout.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
      win.webContents.send("sync:status", { git: true, state: "idle", waiting: 0, remote: false });
    });
    await expect(saveState).toHaveAttribute("data-state", "savedLocal");
    await saveState.hover();
    const backupCard = page.getByRole("dialog", { name: "Backup", exact: true });
    await expect(backupCard).toBeVisible();
    await assertTwoColumnIconLayout(backupCard);
    await page.mouse.move(500, 300);
    await page.keyboard.press("Escape");
    await expect(backupCard).toBeHidden();

    // Helper to push a SyncAlertReport to the renderer.
    const pushAlert = (report: SyncAlertReport) =>
      app.evaluate(({ BrowserWindow }, r) => {
        const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("index.html"))!;
        win.webContents.send("syncAlert:status", r);
      }, report);

    const base = { folder: "Documents\\prabins-notes", repository: "prabin-demo/prabins-notes", lastBackup: "2026-11-24T09:00:00Z" };

    // 2. Sign-in failure: writing continues uninterrupted, one toast shows, corner + Files header both open the two-column card.
    await pushAlert({ ...base, cause: "signIn" });
    await expect(saveState).toHaveAttribute("data-state", "error");
    await expect(page.getByText("Your notes aren't being backed up: GitHub sign-in stopped working.")).toBeVisible();

    // Writing carries on during account failure and persists to disk.
    await editor.click();
    await page.keyboard.type(" Written during auth failure.");
    await expect(editor).toContainText("Written during auth failure.");
    const modKey = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modKey}+S`);
    await expect.poll(() => {
      const dirsToCheck = [join(dirs.docs, "notes"), join(dirs.docs, "private", "notes")].filter((d) => existsSync(d));
      return dirsToCheck
        .flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".md")).map((f) => readFileSync(join(d, f), "utf8")))
        .join("\n");
    }).toContain("Written during auth failure.");

    // Corner popover opens two-column IconLayout with Not now + Sign in again (primary last).
    await saveState.hover();
    const card = page.getByRole("dialog", { name: "Sync problem", exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Not backed up · sign in to GitHub");
    await expect(card).toContainText("This folder: Documents\\prabins-notes");
    await expect(card).toContainText("Notes on GitHub: prabin-demo/prabins-notes");
    await assertTwoColumnIconLayout(card);
    // Not now dismisses the popover while keeping the alert icon in the corner.
    await card.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(card).toBeHidden();
    await expect(saveState).toHaveAttribute("data-state", "error");

    // Files header carries the same alert icon and opens the same card.
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+O`);
    const headerAlert = page.locator("#filesRecoveryAlert");
    await expect(headerAlert).toBeVisible();
    await headerAlert.hover();
    const headerCard = page.getByRole("dialog", { name: "Sync problem", exact: true });
    await expect(headerCard).toBeVisible();
    await expect(headerCard).toContainText("Not backed up · sign in to GitHub");
    await assertTwoColumnIconLayout(headerCard);
    await headerCard.getByRole("button", { name: "Not now", exact: true }).click();
    await expect(headerCard).toBeHidden();
    // Close the floating Files drawer before hovering the bottom-left corner indicator again.
    await page.keyboard.press(`${mod}+O`);
    await expect(page.getByRole("complementary", { name: "Files" })).toBeHidden();

    // 3. Remaining non-busy causes render their exact titles and primary actions in two-column IconLayout.
    const cases: { report: SyncAlertReport; title: string; primary: string; secondary?: string }[] = [
      { report: { ...base, cause: "otherAccount", login: "other" }, title: "Signed in as @other", primary: "Switch account" },
      { report: { ...base, cause: "remoteGone" }, title: "Your notes aren't on GitHub", primary: "Choose what to do…" },
      { report: { ...base, cause: "unlinked", count: 4 }, title: "Not connected to your notes on GitHub", primary: "Sync now" },
      { report: { ...base, cause: "inbound", count: 3, reason: "They couldn't come in because the network dropped during the last sync." }, title: "GitHub has 3 changes this computer doesn't have", primary: "Sync now" },
      { report: { ...base, cause: "massDelete", count: 48, paused: true }, title: "48 notes are missing from this folder", primary: "Restore them", secondary: "Remove them from GitHub too" },
      { report: { ...base, cause: "failed", reason: "Backing up failed because GitHub stopped answering." }, title: "Sync didn't finish", primary: "Try again" },
    ];
    for (const c of cases) {
      await pushAlert(c.report);
      await saveState.hover();
      const cCard = page.getByRole("dialog", { name: "Sync problem", exact: true });
      await expect(cCard).toBeVisible();
      await expect(cCard).toContainText(c.title);
      await expect(cCard.getByRole("button", { name: c.primary, exact: true })).toBeVisible();
      if (c.secondary) await expect(cCard.getByRole("button", { name: c.secondary, exact: true })).toBeVisible();
      await assertTwoColumnIconLayout(cCard);
      await page.mouse.move(500, 300);
      await page.keyboard.press("Escape");
      await expect(cCard).toBeHidden();
    }

    // 4. Busy states (autoSync, syncing) show turning ring + progress text in corner and ProgressBar in card.
    await pushAlert({ ...base, cause: "autoSync", progress: 45 });
    await expect(saveState).toHaveAttribute("data-state", "syncing");
    await expect(saveState).toContainText("Downloading your notes · 45%");
    await expect(saveState.locator("[data-backup-ring]")).toBeVisible();
    await saveState.hover();
    const busyCard = page.getByRole("dialog", { name: "Sync problem", exact: true });
    await expect(busyCard).toBeVisible();
    await expect(busyCard.getByRole("progressbar")).toBeVisible();
    await assertTwoColumnIconLayout(busyCard);

    // Clearing alert restores normal state.
    await pushAlert({});
    await expect(headerAlert).toBeHidden();
  } finally {
    await quit(l);
  }
});

test("G5.4: mass external deletion pauses backup and Restore them recovers the exact notes on disk", async () => {
  const { dirs } = instance();
  const notesDir = join(dirs.docs, "notes");
  for (let i = 1; i <= 4; i++) {
    writeFileSync(join(notesDir, `note-${i}.md`), `# Note ${i}\n\nPreserved body ${i}.\n`);
  }
  git(dirs.docs, "add", ".");
  git(dirs.docs, "commit", "-m", "Add 4 notes for mass deletion test");

  // Delete 4 notes externally (> half of tracked notes) before launch.
  for (let i = 1; i <= 4; i++) rmSync(join(notesDir, `note-${i}.md`));

  const l = await launch(dirs);
  const { page } = l;
  try {
    await expect(page.getByRole("textbox", { name: "Note" })).toBeFocused();
    const saveState = page.locator("#saveState");
    await expect(saveState).toHaveAttribute("data-state", "error", { timeout: 10_000 });
    await saveState.hover();
    const card = page.getByRole("dialog", { name: "Sync problem", exact: true });
    await expect(card).toBeVisible();
    await expect(card).toContainText("4 notes are missing from this folder");
    await assertTwoColumnIconLayout(card);
    await card.getByRole("button", { name: "Restore them", exact: true }).click();
    await expect(card).toBeHidden();

    // All 4 deleted notes are back on disk with exact bytes.
    for (let i = 1; i <= 4; i++) {
      const p = join(notesDir, `note-${i}.md`);
      await expect.poll(() => existsSync(p)).toBe(true);
      expect(readFileSync(p, "utf8")).toBe(`# Note ${i}\n\nPreserved body ${i}.\n`);
    }
  } finally {
    await quit(l);
  }
});
