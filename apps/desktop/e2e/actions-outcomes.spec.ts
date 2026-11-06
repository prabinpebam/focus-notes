import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../../../packages/core/src/actions-catalog.ts";
import { DATA_FILES } from "../../../packages/core/src/inventory.ts";
import { MessageCatalog } from "../../../packages/core/src/messages.ts";
import { test, expect, type Page } from "./fixtures.ts";
import { fileRow, launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { git, instance, write } from "./instance.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../../packages/views/messages/en.json"), "utf8")) as Record<string, string>;
const catalog = new MessageCatalog("en", messages);
const actionLabel = (key: string) => catalog.format(key, { platform: process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux" });
const actionRow = (page: Page, label: string) => actions(page).getByRole("option").filter({ has: page.getByText(label, { exact: true }) });
const actions = (page: Page) => page.getByRole("dialog", { name: "Actions", exact: true });
const editor = (page: Page) => page.getByRole("textbox", { name: "Note", exact: true });
const files = (page: Page) => page.getByRole("complementary", { name: "Files", exact: true });
const settings = (page: Page) => page.getByRole("dialog", { name: "Settings", exact: true });
const systemScheme = async ({ app }: Launched, scheme: "light" | "dark") => {
  await app.evaluate(({ nativeTheme, BrowserWindow }, value) => {
    nativeTheme.themeSource = value;
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send("scheme:changed", nativeTheme.shouldUseDarkColors ? "dark" : "light");
  }, scheme);
};

interface Outcome {
  selection?: true;
  publicNote?: true;
  history?: true;
  prepare?(l: Launched, docs: string): Promise<void>;
  check(l: Launched, docs: string): Promise<void>;
}

const destination = (name: string): Outcome => ({
  check: async ({ page }) => { await expect(page.getByRole("dialog", { name, exact: true })).toBeVisible(); },
});
const captureClipboard = async ({ app }: Launched) => {
  await app.evaluate(({ clipboard }) => {
    let copied = "";
    clipboard.writeText = (text: string) => { copied = text; };
    clipboard.readText = () => copied;
  });
};
const outcomes: Record<string, Outcome> = {
  "help.open": {
    prepare: async ({ app }) => {
      await app.evaluate(({ shell }) => {
        Reflect.set(globalThis, "mactHelpUrl", "");
        shell.openExternal = async (url: string) => { Reflect.set(globalThis, "mactHelpUrl", url); };
      });
    },
    check: async ({ app, page }, docs) => {
      await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "mactHelpUrl"))).toBe("https://prabinpebam.github.io/focus-notes/documentations/#help/index.md");
      await expect(editor(page)).toContainText("Native outcome proof.");
      expect(readFileSync(join(docs, "private", "notes", "welcome.md"), "utf8")).toBe("# Welcome\n\n## Scope\n\nNative outcome proof.\n");
    },
  },
  "settings.open": destination("Settings"),
  "shortcuts.open": destination("Keyboard shortcuts"),
  "toolbar.customize": destination("Customize toolbar"),
  "theme.manager.open": {
    check: async ({ page }) => { await expect(page.getByRole("complementary", { name: "Theme", exact: true })).toBeVisible(); },
  },
  "feedback.open": destination("Send feedback"),
  "diagnostics.reportProblem": destination("Send feedback"),
  "ai.connect": {
    prepare: async ({ app }) => {
      await app.evaluate(({ ipcMain }) => {
        Reflect.set(globalThis, "mactAccountChecking", false);
        const account = new Promise((resolve) => {
          Reflect.set(globalThis, "mactReleaseAccount", () => resolve({ gcm: false, gh: false, via: "helper" }));
        });
        ipcMain.removeHandler("firstRun:account");
        ipcMain.handle("firstRun:account", () => {
          Reflect.set(globalThis, "mactAccountChecking", true);
          return account;
        });
      });
    },
    check: async ({ page, app }) => {
      await expect.poll(() => app.evaluate(() => Reflect.get(globalThis, "mactAccountChecking"))).toBe(true);
      await expect(settings(page).getByRole("button", { name: "Service", exact: true })).toBeVisible();
      await expect(settings(page).getByRole("textbox", { name: "Model", exact: true })).toBeVisible();
      await settings(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(settings(page).getByText("No AI connections", { exact: true })).toBeVisible();
      await app.evaluate(() => Reflect.get(globalThis, "mactReleaseAccount")());
      await expect(settings(page).getByRole("button", { name: "Service", exact: true })).toBeHidden();
    },
  },
  "note.share": {
    check: async ({ page }) => {
      const share = page.getByRole("dialog", { name: /^Share .Welcome.$/ });
      await expect(share.getByRole("button", { name: "Copy share information", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(share).toBeHidden();
      await expect(editor(page)).toContainText("Native outcome proof.");
    },
  },
  "note.copyPublicLink": {
    publicNote: true,
    prepare: captureClipboard,
    check: async ({ page, app }) => {
      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("https://ada.github.io/notes/n/welcome/");
      await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText(/copied/i);
    },
  },
  "note.delete": {
    publicNote: true,
    history: true,
    check: async ({ page }, docs) => {
      const path = join(docs, "notes", "welcome.md");
      const confirm = page.getByRole("dialog", { name: "Delete", exact: true });
      await expect(confirm).toBeVisible();
      expect(existsSync(path)).toBe(true);
      await confirm.getByRole("button", { name: "Delete and unpublish", exact: true }).click();
      await expect.poll(() => existsSync(path)).toBe(false);
      await expect.poll(() => git(docs, "log", "--all", "--diff-filter=D", "--format=%H", "--", "notes/welcome.md"), { timeout: 15_000 }).not.toBe("");
      await files(page).getByRole("button", { name: /^Recently deleted/ }).click();
      await expect(files(page).getByText(/^welcome$/i)).toBeVisible({ timeout: 15_000 });
      await files(page).getByRole("button", { name: "Restore", exact: true }).click();
      await expect.poll(() => existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("Native outcome proof.");
      await expect(fileRow(files(page).getByRole("tree", { name: "Notes and folders", exact: true }), /^Welcome, public /)).toBeFocused();
    },
  },
  "files.import": {
    prepare: async ({ app }, docs) => {
      const source = join(docs, "..", "Imported native.md");
      write(source, "# Imported native\n\nImported through Actions.\n");
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as typeof dialog.showOpenDialog;
      }, source);
    },
    check: async ({ page }, docs) => {
      await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText("Imported");
      const path = join(docs, "private", "notes", "imported-native.md");
      await expect.poll(() => existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf8")).toContain("Imported through Actions.");
      expect(readFileSync(join(docs, "private", "notes", "welcome.md"), "utf8")).toContain("Native outcome proof.");
      if (!(await files(page).isVisible())) await page.keyboard.press(`${mod}+O`);
      await fileRow(files(page).getByRole("tree", { name: "Notes and folders", exact: true }), "Imported native").dblclick();
      await expect(editor(page)).toContainText("Imported through Actions.");
    },
  },
  "projects.open": destination("Open"),
  "projects.new": destination("New project"),
  "projects.openFile": {
    prepare: async ({ app }, docs) => {
      const path = join(docs, "private", "notes", "chosen.md");
      write(path, "# Chosen file\n\nOpened from Actions.\n");
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      }, path);
    },
    check: async ({ page, app }, docs) => {
      await expect(editor(page)).toContainText("Opened from Actions.");
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
      expect(readFileSync(join(docs, "private", "notes", "chosen.md"), "utf8")).toBe("# Chosen file\n\nOpened from Actions.\n");
    },
  },
  "diagnostics.save": {
    prepare: async ({ app }, docs) => {
      await app.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, join(docs, "..", "actions-report.md"));
    },
    check: async ({ page }, docs) => {
      const path = join(docs, "..", "actions-report.md");
      await expect.poll(() => existsSync(path), { timeout: 15_000 }).toBe(true);
      const report = readFileSync(path, "utf8");
      expect(report).toContain("## Focus Notes diagnostic report");
      for (const secret of ["Native outcome proof.", "welcome.md", docs]) expect(report).not.toContain(secret);
      await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText("saved");
    },
  },
  "note.newIn": destination(messages["command.note.newIn"]!),
  "note.new": {
    check: async ({ page }) => {
      await expect(editor(page)).toBeFocused();
      await expect(editor(page)).toHaveText("");
    },
  },
  "files.newFolder": {
    check: async ({ page }, docs) => {
      const input = files(page).getByRole("textbox");
      await expect(input).toBeFocused();
      await input.fill("Created in Actions");
      await page.keyboard.press("Enter");
      await expect.poll(() => existsSync(join(docs, "private", "notes", "Created in Actions"))).toBe(true);
      await expect(fileRow(files(page).getByRole("tree", { name: "Notes and folders", exact: true }), "Created in Actions")).toBeVisible();
    },
  },
  "project.settings": {
    check: async ({ page }) => { await expect(settings(page).getByRole("textbox", { name: "Name", exact: true })).toBeVisible(); },
  },
  "project.rename": {
    check: async ({ page }) => { await expect(settings(page).getByRole("textbox", { name: "Name", exact: true })).toBeFocused(); },
  },
  "appearance.light": {
    prepare: async (l) => { await systemScheme(l, "dark"); },
    check: async ({ page }) => { await expect(page.locator("html")).toHaveAttribute("data-theme", "paper"); },
  },
  "appearance.dark": {
    check: async ({ page }) => { await expect(page.locator("html")).toHaveAttribute("data-theme", "ink"); },
  },
  "appearance.system": {
    prepare: async (l) => { await systemScheme(l, "dark"); },
    check: async (l) => {
      const { page } = l;
      await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
      await systemScheme(l, "light");
      await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
    },
  },
  "focus.toggle": {
    check: async ({ page }) => { await expect(page.locator("html")).not.toHaveAttribute("data-focus", "on"); },
  },
  "files.open": {
    check: async ({ page }) => { await expect(files(page)).toBeVisible(); },
  },
  "find.allNotes": {
    check: async ({ page }) => { await expect(page.getByRole("combobox", { name: "Search all notes", exact: true })).toBeFocused(); },
  },
  "note.reveal": {
    check: async ({ page }) => { await expect(fileRow(files(page).getByRole("tree", { name: "Notes and folders", exact: true }), "Welcome")).toBeFocused(); },
  },
  "note.rename": {
    check: async ({ page }, docs) => {
      const input = files(page).getByRole("textbox");
      await expect(input).toBeFocused();
      await input.fill("Renamed");
      await page.keyboard.press("Enter");
      await expect.poll(() => existsSync(join(docs, "private", "notes", "Renamed.md"))).toBe(true);
      await expect(editor(page)).toContainText("Welcome");
    },
  },
  "note.move": {
    check: async ({ page }, docs) => {
      const move = page.getByRole("dialog", { name: /Move/ });
      await expect(move.getByRole("combobox")).toBeFocused();
      await move.getByRole("combobox").fill("archive");
      await page.keyboard.press("Enter");
      await expect.poll(() => existsSync(join(docs, "private", "notes", "archive", "welcome.md"))).toBe(true);
      await expect(editor(page)).toContainText("Welcome");
    },
  },
  "note.duplicate": {
    check: async ({ page }, docs) => {
      const root = join(docs, "private", "notes");
      await expect.poll(() => readdirSync(root).filter((p) => p.endsWith(".md")).length).toBe(2);
      await expect(files(page)).toBeVisible();
      const contents = readdirSync(root).filter((p) => p.endsWith(".md")).map((p) => readFileSync(join(root, p), "utf8"));
      expect(contents).toContain("# Welcome\n\n## Scope\n\nNative outcome proof.\n");
      expect(contents).toContain("# Welcome copy\n\n## Scope\n\nNative outcome proof.\n");
    },
  },
  "note.makePublic": {
    check: async ({ page }, docs) => {
      const confirm = page.getByRole("dialog", { name: "Make public?", exact: true });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Make public", exact: true }).click();
      await expect.poll(() => existsSync(join(docs, "notes", "welcome.md"))).toBe(true);
      expect(existsSync(join(docs, "private", "notes", "welcome.md"))).toBe(false);
    },
  },
  "history.open": {
    check: async ({ page }) => { await expect(page.getByRole("complementary", { name: "Note history", exact: true })).toBeVisible(); },
  },
  "outline.show": {
    check: async ({ page }) => { await expect(page.getByRole("navigation", { name: "Contents", exact: true })).toBeVisible(); },
  },
  "note.copyLink": {
    prepare: captureClipboard,
    check: async ({ page, app }) => {
      await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe("[Welcome](welcome.md)");
      await expect(page.getByRole("region", { name: "Notifications", exact: true })).toContainText("Copied a link");
    },
  },
  "link.edit": {
    selection: true,
    check: async ({ page }) => { await expect(page.getByRole("region", { name: "Link editor", exact: true })).toBeVisible(); },
  },
};

for (const [id, tag] of [["format.bold", "strong"], ["format.italic", "em"], ["format.strike", "s"], ["format.code", "code"]] as const) {
  outcomes[id] = {
    selection: true,
    check: async ({ page }) => {
      await expect(editor(page).locator(tag)).toHaveText("Native outcome proof.");
      await expect(editor(page)).toBeFocused();
      await page.keyboard.press(`${mod}+z`);
      await expect(editor(page).locator(tag)).toHaveCount(0);
      await expect(editor(page)).toContainText("Native outcome proof.");
    },
  };
}

for (const [id, outcome] of Object.entries(outcomes)) {
  test(`MACT.1, MACT.6 native outcome: ${id}`, async () => {
    const entry = CATALOG.find((e) => e.id === id);
    expect(entry, "each native proof belongs to the catalogue").toBeDefined();
    const inst = instance();
    const root = outcome.publicNote ? join(inst.dirs.docs, "notes") : join(inst.dirs.docs, "private", "notes");
    write(join(root, "welcome.md"), "# Welcome\n\n## Scope\n\nNative outcome proof.\n");
    write(join(inst.dirs.docs, "private", "notes", "archive", ".keep"), "");
    if (outcome.publicNote) {
      write(join(inst.dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(root, "welcome.md") }));
      write(join(inst.dirs.userData, DATA_FILES.setup), JSON.stringify({ version: 1, site: "https://ada.github.io/notes/", steps: {} }));
    }
    if (outcome.history) {
      const repo = outcome.publicNote ? inst.dirs.docs : join(inst.dirs.docs, "private");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "Seed native outcome");
    }
    const l = await launch(inst.dirs);
    try {
      const { page } = l;
      await expect(editor(page)).toContainText("Native outcome proof.");
      await outcome.prepare?.(l, inst.dirs.docs);
      if (outcome.selection) {
        await editor(page).focus();
        await page.keyboard.press(`${mod}+End`);
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+End");
      }
      await page.keyboard.press(`${mod}+/`);
      const field = actions(page).getByRole("combobox");
      await expect(field).toBeFocused();
      const label = actionLabel(entry!.label);
      await field.fill(label);
      const row = actionRow(page, label);
      await expect(row).toBeVisible();
      await expect(row).not.toHaveAttribute("aria-disabled", "true");
      await row.click();
      await expect(actions(page)).toBeHidden();
      await outcome.check(l, inst.dirs.docs);
    } finally {
      await quit(l);
      if (process.platform === "win32") {
        const script = join(import.meta.dirname, "../../../tools/dev/close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "pipe" });
      }
    }
  });
}

for (const context of ["Local notes", "standalone file"] as const) {
  test(`MACT.4, MACT.6: ${context} keeps project actions hidden and reveals only its own file`, async () => {
    const dirs = tempDirs();
    const path = join(dirs.docs, "Welcome.md");
    const original = "# Local proof\n\nKeep these local bytes.\n";
    write(path, original);
    write(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true, lastNotePath: path }));
    const l = await launch(dirs, {
      FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_LOCAL_NOTES_HOME: dirs.docs,
      ...(context === "standalone file" ? { FOCUS_NOTES_PROJECT_NOTE: path } : {}),
    });
    try {
      await expect(editor(l.page)).toContainText("Keep these local bytes.");
      await l.app.evaluate(({ shell }) => {
        Reflect.set(globalThis, "mactRevealedPath", "");
        shell.showItemInFolder = (path) => { Reflect.set(globalThis, "mactRevealedPath", path); };
      });
      await l.page.keyboard.press(`${mod}+/`);
      const field = actions(l.page).getByRole("combobox");
      await expect(field).toBeFocused();
      for (const id of ["project.settings", "project.rename", "note.share", "note.publish", "history.open", "files.import"]) {
        const entry = CATALOG.find((e) => e.id === id)!;
        const label = actionLabel(entry.label);
        await field.fill(label);
        await expect(actionRow(l.page, label)).toHaveCount(0);
      }
      const reveal = actionLabel(CATALOG.find((e) => e.id === "note.revealLocal")!.label);
      await field.fill(reveal);
      const row = actionRow(l.page, reveal);
      await expect(row).not.toHaveAttribute("aria-disabled", "true");
      await row.click();
      await expect(actions(l.page)).toBeHidden();
      await expect.poll(() => l.app.evaluate(() => String(Reflect.get(globalThis, "mactRevealedPath")))).toBe(path);
      expect(readFileSync(path, "utf8")).toBe(original);
      expect(existsSync(join(dirs.docs, ".git"))).toBe(false);
    } finally {
      await quit(l);
      if (process.platform === "win32") {
        const script = join(import.meta.dirname, "../../../tools/dev/close-test-apps.ps1");
        for (const flags of [["-WhatIf"], []]) execFileSync("pwsh", ["-NoProfile", "-File", script, "-OnlyPid", String(l.pid), ...flags], { stdio: "pipe" });
      }
    }
  });
}
