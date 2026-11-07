import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DATA_FILES, DATA_FOLDERS } from "../../../packages/core/src/inventory.ts";
import { test, expect } from "./fixtures.ts";
import { fileRow, launch, quit, tempDirs, windowBox, type Launched } from "./helpers.ts";
import { configureSharing, git, instance, write } from "./instance.ts";
import { picture } from "./fre-fakes.ts";
import { card, existingInstance, start as startFirstRun, world } from "./github-world.ts";
import { frameProblems } from "./frames.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

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

async function sectionOutcomes(l: Launched) {
  await l.page.evaluate(() => {
    const said: string[] = [];
    Reflect.set(globalThis, "uiStatesLiveOutcomes", said);
    const previous = new WeakMap<Element, string>();
    const selector = '[role="status"][aria-live="polite"]';
    for (const element of document.querySelectorAll(selector)) previous.set(element, element.textContent?.trim() ?? "");
    new MutationObserver(records => {
      const affected = new Set<Element>();
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        const live = target?.closest(selector);
        if (live) affected.add(live);
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches(selector)) affected.add(node);
          for (const child of node.querySelectorAll(selector)) affected.add(child);
        }
      }
      for (const element of affected) {
        if (!element.isConnected) continue;
        const text = element.textContent?.trim() ?? "";
        if (text && previous.get(element) !== text) said.push(text);
        previous.set(element, text);
      }
    }).observe(document.body, { childList: true, characterData: true, subtree: true });
  });
  return () => l.page.evaluate(() => Reflect.get(globalThis, "uiStatesLiveOutcomes") as string[]);
}

for (const scheme of ["light", "dark"] as const) test(`First-run ${scheme} shows a themed native frame before interaction`, async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, appearance: scheme }));
  const entrypoint = join(dirs.userData, "inspect-first-frame.cjs");
  const main = pathToFileURL(fileURLToPath(new URL("../out/main/main.mjs", import.meta.url))).href;
  writeFileSync(entrypoint, `
const { app, ipcMain, nativeTheme, BrowserWindow } = require("electron");
nativeTheme.themeSource = ${JSON.stringify(scheme === "dark" ? "light" : "dark")};
globalThis.uiStatesFirstFrames = [];
globalThis.uiStatesStartupFrames = [];
globalThis.uiStatesPaintAcks = [];
app.on("web-contents-created", (_event, contents) => {
  if (contents.getType() !== "window") return;
  const capture = contents.capturePage.bind(contents);
  contents.capturePage = async (...args) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    globalThis.uiStatesPaintAcks.push(!BrowserWindow.fromWebContents(contents)?.isVisible());
    return capture(...args);
  };
  contents.once("did-start-loading", () => contents.beginFrameSubscription(image => {
    const visible = BrowserWindow.fromWebContents(contents)?.isVisible() === true;
    globalThis.uiStatesStartupFrames.push({ visible, png: image.toPNG().toString("base64") });
  }));
});
ipcMain.on("window:firstFrame", event => {
  const hidden = !BrowserWindow.fromWebContents(event.sender).isVisible();
  const pixels = event.sender.capturePage(undefined, { stayHidden: true }).then(image => image.toPNG().toString("base64"));
  event.sender.executeJavaScript(\`(() => {
    const root = document.querySelector("[data-app-root]");
    return { theme: document.documentElement.dataset.theme, scheme: getComputedStyle(document.documentElement).colorScheme,
      background: root && getComputedStyle(root).backgroundColor, width: root && root.getBoundingClientRect().width,
      height: root && root.getBoundingClientRect().height };
  })()\`).then(async frame => globalThis.uiStatesFirstFrames.push({ ...frame, hidden, png: await pixels }));
});
import(${JSON.stringify(main)});
`);
  const l = await launch(dirs, {}, { firstRun: true, entrypoint });
  try {
    await expect(l.page.getByRole("button", { name: "Get started", exact: true })).toBeVisible();
    await expect.poll(() => l.app.evaluate(() => Reflect.get(globalThis, "uiStatesFirstFrames").length)).toBe(1);
    const frames = await l.app.evaluate(() => Reflect.get(globalThis, "uiStatesFirstFrames")) as { hidden: boolean; theme: string; scheme: string; background: string; width: number; height: number; png: string }[];
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "uiStatesPaintAcks").slice(0, 2))).toEqual([true, true]);
    expect(frames[0]).toMatchObject({ hidden: true, theme: scheme === "dark" ? "ink" : "paper", scheme });
    expect(frames[0]!.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(frames[0]!.width).toBeGreaterThan(300);
    expect(frames[0]!.height).toBeGreaterThan(250);
    if (scheme === "dark") expect(frames[0]!.background).not.toBe("rgb(255, 255, 255)");
    expect(frameProblems([{ label: "first-frame report", at: Date.now(), data: Buffer.from(frames[0]!.png, "base64") }],
      await windowBox(l.page), await l.page.evaluate(() => innerWidth), () => scheme)).toEqual([]);
    await l.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300)))));
    const startup = await l.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.webContents.endFrameSubscription();
      return Reflect.get(globalThis, "uiStatesStartupFrames") as { visible: boolean; png: string }[];
    });
    const visibleFrames = startup.filter(frame => frame.visible).map(frame => ({
      label: `${scheme} startup after native show`, at: 0, data: Buffer.from(frame.png, "base64"),
    }));
    process.stdout.write(`[startup frames] ${scheme}: ${startup.length - visibleFrames.length} hidden, ${visibleFrames.length} after show\n`);
    expect(visibleFrames.length).toBeGreaterThan(0);
    expect(frameProblems(visibleFrames, await windowBox(l.page), await l.page.evaluate(() => innerWidth), () => scheme)).toEqual([]);
    expect(l.log.some(line => line.includes("window-shown on=timeout"))).toBe(false);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:window.firstFrame").length)).toBe(1);
  } finally { await closeTestApp(l); }
});

test("Files hover responds to hover capability without losing touch access or keyboard focus", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), bytes = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+p" : "Control+Alt+p");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const row = files.getByRole("treeitem").filter({ hasText: "Hello" }).first();
    await expect(row).toBeVisible();
    await l.page.mouse.move(0, 0);
    const rest = await row.evaluate(el => getComputedStyle(el).backgroundColor);
    await row.hover();
    await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(rest);
    const cdp = await l.page.context().newCDPSession(l.page);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    expect(await l.page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
    await expect.poll(() => row.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(rest);
    const more = row.locator("[data-row-more]");
    await expect(more).toBeVisible();
    await more.click();
    await expect(l.page.getByRole("menu")).toBeVisible();
    await l.page.keyboard.press("Escape");
    await row.focus();
    await l.page.keyboard.press("Shift+F10");
    await expect(l.page.getByRole("menu")).toBeVisible();
    await l.page.keyboard.press("Escape");
    expect(readFileSync(note)).toEqual(bytes);
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  } finally { await closeTestApp(l); }
});

test("A crashed native panel reloads locally and opens safe Feedback without losing the note", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), bytes = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("First line.");
    const original = await editor.elementHandle();
    const origin = await l.page.evaluate(() => performance.timeOrigin);
    await l.page.evaluate(() => {
      const set = Element.prototype.setAttribute;
      Reflect.set(globalThis, "uiStatesRestorePanel", () => { Element.prototype.setAttribute = set; });
      Element.prototype.setAttribute = function (name, value) {
        if (name === "role" && value === "dialog") throw new Error("synthetic-panel-private-path-and-token");
        return set.call(this, name, value);
      };
    });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const failure = l.page.getByRole("region", { name: "A panel couldn't load", exact: true });
    await expect(failure).toContainText("Your notes are kept.");
    await failure.getByRole("button", { name: "Reload panel", exact: true }).click();
    await expect(failure).toBeVisible();
    expect(await original!.evaluate(el => el.isConnected)).toBe(true);
    await l.page.evaluate(() => {
      const restore: unknown = Reflect.get(globalThis, "uiStatesRestorePanel");
      if (typeof restore !== "function") throw new Error("Missing panel fixture cleanup");
      restore(); Reflect.deleteProperty(globalThis, "uiStatesRestorePanel");
    });
    await failure.getByRole("button", { name: "Report problem", exact: true }).click();
    const feedback = l.page.getByRole("dialog", { name: "Send feedback", exact: true });
    await expect(feedback).toBeVisible();
    await expect(feedback).not.toContainText("synthetic-panel-private-path-and-token");
    await expect(feedback.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("A panel couldn't load");
    await expect(feedback.getByRole("switch", { name: "Attach diagnostic report", exact: true })).not.toBeChecked();
    await feedback.getByRole("button", { name: "Close", exact: true }).click();
    await expect(failure).toBeVisible();
    await failure.getByRole("button", { name: "Reload panel", exact: true }).click();
    await expect(l.page.getByRole("dialog", { name: "Settings", exact: true })).toBeVisible();
    await expect(failure).toHaveCount(0);
    expect(await original!.evaluate(el => el.isConnected)).toBe(true);
    expect(await l.page.evaluate(() => performance.timeOrigin)).toBe(origin);
    await expect(editor).toContainText("First line.");
    expect(readFileSync(note)).toEqual(bytes);
    const windowCount = await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(windowCount).toBe(1);
  } finally { await closeTestApp(l); }
});

test("Open and Recent empty first actions choose a real project and replace their empty columns", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), bytes = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    await l.app.evaluate(({ ipcMain, dialog }, folder) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      const list: unknown = handlers instanceof Map ? handlers.get("projects:list") : undefined;
      if (typeof list !== "function") throw new Error("Project listing unavailable");
      Reflect.set(globalThis, "uiStatesChosenProject", false);
      Reflect.set(globalThis, "uiStatesProjectPickers", 0);
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", (...args) => Reflect.get(globalThis, "uiStatesChosenProject") ? list(...args) : []);
      dialog.showOpenDialog = async () => {
        Reflect.set(globalThis, "uiStatesChosenProject", true);
        Reflect.set(globalThis, "uiStatesProjectPickers", Number(Reflect.get(globalThis, "uiStatesProjectPickers")) + 1);
        return { canceled: false, filePaths: [folder] };
      };
    }, dirs.docs);
    for (const [index, title] of ["No recent notes", "No projects yet"].entries()) {
      await l.app.evaluate(() => Reflect.set(globalThis, "uiStatesChosenProject", false));
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
      const open = l.page.getByRole("dialog", { name: "Open", exact: true });
      await expect(open.getByText("No recent notes", { exact: true })).toBeVisible();
      await expect(open.getByText("No projects yet", { exact: true })).toBeVisible();
      const empty = open.locator("[data-tone=neutral]").filter({ hasText: title });
      expect(await empty.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBeGreaterThan(0);
      await empty.getByRole("button", { name: "Open project", exact: true }).click();
      await expect(open).toHaveCount(0, { timeout: 30_000 });
      expect(await l.app.evaluate(() => Number(Reflect.get(globalThis, "uiStatesProjectPickers")))).toBe(index + 1);
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
      await expect(open.getByRole("button", { name: "Open ws", exact: true })).toBeVisible();
      await expect(open.getByRole("button", { name: "Open welcome", exact: true })).toBeVisible();
      await expect(open.getByText("No recent notes", { exact: true })).toHaveCount(0);
      await expect(open.getByText("No projects yet", { exact: true })).toHaveCount(0);
      await l.page.keyboard.press("Escape");
    }
    expect(readFileSync(note)).toEqual(bytes);
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally { await closeTestApp(l); }
});

test("Site preview first actions use Files and real content replaces and clears all three reachable empty lists", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), bytes = readFileSync(note);
  rmSync(join(dirs.docs, "notes", "hello.md"));
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note,
    sharingDrafts: { [dirs.docs]: { owner: "personal", people: [] } },
  }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    await l.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("access:load");
      ipcMain.handle("access:load", () => ({ available: true, localReview: true, site: "https://local.test/", vault: true, grants: [] }));
    });
    const preview = l.page.getByRole("region", { name: "Preview site", exact: true });
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const openPreview = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
      await settings.getByRole("button", { name: "Preview site…", exact: true }).click();
      await expect(preview).toBeVisible();
    };
    for (const [action, title, detail] of [
      ["Add link", "No navigation links", "Choose a published note for the navigation."],
      ["Add section", "No sections yet", "Group published notes into a section."],
      ["Choose note", "No published notes", "Choose a note to include in your site."],
    ] as const) {
      await openPreview();
      for (const title of ["No navigation links", "No sections yet", "No published notes"]) await expect(preview.getByText(title, { exact: true })).toBeVisible();
      const empty = preview.locator("[data-tone=neutral]").filter({ hasText: title });
      expect(await empty.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBe(160);
      expect(await empty.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(160);
      await expect(empty).toContainText(detail);
      await preview.getByRole("button", { name: action, exact: true }).click();
      await expect(preview).toHaveCount(0);
      await expect(files).toBeVisible();
      await expect(l.page.getByRole("dialog", { name: "Settings", exact: true })).toHaveCount(0);
    }
    write(join(dirs.docs, "notes", "home.md"), "# Home sample\n\nActual public sample content.\n");
    write(join(dirs.docs, "notes", "Essays", "second.md"), "# Section sample\n\nA real section article.\n");
    await expect(files.getByRole("treeitem").filter({ hasText: "Home sample" })).toBeVisible();
    await expect(files.getByRole("treeitem").filter({ hasText: "Essays" })).toBeVisible();
    await openPreview();
    for (const title of ["No navigation links", "No sections yet", "No published notes"]) await expect(preview.getByText(title, { exact: true })).toHaveCount(0);
    await expect(preview.getByText("Home sample", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Essays", exact: true }).click();
    await expect(preview.getByText("Section sample", { exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Close preview", exact: true }).click();
    rmSync(join(dirs.docs, "notes", "home.md"));
    rmSync(join(dirs.docs, "notes", "Essays", "second.md"));
    await l.page.getByRole("dialog", { name: "Settings", exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+p" : "Control+Alt+p");
    await expect(files.getByRole("treeitem").filter({ hasText: "Home sample" })).toHaveCount(0);
    await expect(files.getByRole("treeitem").filter({ hasText: "Section sample" })).toHaveCount(0);
    await openPreview();
    for (const title of ["No navigation links", "No sections yet", "No published notes"]) await expect(preview.getByText(title, { exact: true })).toBeVisible();
    await expect(preview.getByText("Home sample", { exact: true })).toHaveCount(0);
    await expect(preview.getByText("Section sample", { exact: true })).toHaveCount(0);
    expect(readFileSync(note)).toEqual(bytes);
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally { await closeTestApp(l); }
});

test("Existing project clone stops safely and resumes its retained folder without another clone", async () => {
  test.setTimeout(150_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  existingInstance(w);
  const l = await startFirstRun(w);
  try {
    await l.app.evaluate(() => Reflect.set(globalThis, "focusNotesSlow", { "firstRun.clone:private": 5000 }));
    await card(l.page).getByRole("button", { name: "Get started", exact: true }).click();
    await card(l.page).getByRole("button", { name: "Continue as Ada", exact: true }).click();
    await card(l.page).getByRole("button", { name: "Open", exact: true }).click();
    const setup = card(l.page);
    await expect(setup.getByText("1 of 3 steps complete", { exact: true })).toBeVisible({ timeout: 20000 });
    await expect(setup.getByText(/^Getting the private notes · 2 of 3 · [3-9] s$/)).toBeVisible();
    await setup.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(setup.getByRole("button", { name: "Stopping after this step…", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(setup.getByText(/^Download stopped\. Downloaded files are kept/)).toBeVisible({ timeout: 10000 });
    const folder = join(dirname(w.dirs.docs), "notes");
    const note = join(folder, "notes", "hello.md");
    expect(existsSync(join(folder, "private", ".git"))).toBe(false);
    const kept = "# Kept in the original clone\n";
    writeFileSync(note, kept);
    await l.app.evaluate(() => Reflect.set(globalThis, "focusNotesSlow", {}));
    await setup.getByRole("button", { name: "Resume download", exact: true }).click();
    await expect(setup.getByRole("heading", { name: "Ready", exact: true })).toBeVisible({ timeout: 30000 });
    expect(readFileSync(note, "utf8")).toBe(kept);
    expect(existsSync(join(folder, "private", "notes", "secret.md"))).toBe(true);
    expect(existsSync(join(dirname(w.dirs.docs), "notes 2"))).toBe(false);
    expect(w.git(join(folder, "private"), "symbolic-ref", "--short", "HEAD")).toBe("main");
  } finally {
    await closeTestApp(l);
    w.server.close();
  }
});

test("First setup stops after its real clone receipt and resumes through acknowledged private-first push", async () => {
  test.setTimeout(180_000);
  const w = await world({ gcm: true });
  w.fakes.store(w.gh.token);
  const l = await startFirstRun(w);
  try {
    await l.app.evaluate(({ BrowserWindow }) => {
      Reflect.set(globalThis, "focusNotesSlow", { "setup:clone": 5000, "setup:push": 5000 });
      const contents = BrowserWindow.getAllWindows()[0]!.webContents;
      const send = contents.send.bind(contents);
      let previous = "";
      const starts: string[] = [];
      Reflect.set(globalThis, "setupStepStarts", starts);
      contents.send = (channel, ...args) => {
        const report: unknown = args[0];
        if (channel === "setup:report" && typeof report === "object" && report && "steps" in report && Array.isArray(report.steps)) {
          const current: unknown = report.steps.find((step: unknown) => typeof step === "object" && step && "state" in step && step.state === "running");
          const id = typeof current === "object" && current && "id" in current && typeof current.id === "string" ? current.id : "";
          if (id && id !== previous) starts.push(id);
          previous = id;
        }
        send(channel, ...args);
      };
    });
    await card(l.page).getByRole("button", { name: "Get started", exact: true }).click();
    await card(l.page).getByRole("button", { name: "Continue as Ada", exact: true }).click();
    await card(l.page).getByRole("button", { name: /^Create my notes(?:$| )/ }).click();
    const setup = card(l.page);
    await expect(setup.getByText(/^Downloading to this computer · 5 of 9/)).toBeVisible({ timeout: 60000 });
    await expect(setup.getByText("4 of 9 steps complete", { exact: true })).toBeVisible();
    await expect(setup.getByText(/^Downloading to this computer · 5 of 9.* · (?:[3-9]|[1-9]\d+) s$/)).toBeVisible();
    await setup.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(setup.getByRole("button", { name: "Stopping after this step…", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(setup.getByText(/^Setup stopped\. Completed files and settings are kept/)).toBeVisible({ timeout: 15000 });
    await expect(setup.getByText("5 of 9 steps complete", { exact: true })).toBeVisible();
    const workspace = join(dirname(w.dirs.docs), "notes");
    const retained = join(workspace, "notes", "retained.md");
    writeFileSync(retained, "# Retained\n\nNever overwrite this note.\n");
    const receipt = JSON.parse(readFileSync(join(w.dirs.userData, DATA_FILES.setup), "utf8"));
    expect(receipt.steps.clone.state).toBe("done");
    expect(receipt.steps.link).toBeUndefined();
    await setup.getByRole("button", { name: "Resume setup", exact: true }).click();
    await expect(setup.getByText(/^Saving to GitHub · 9 of 9/)).toBeVisible({ timeout: 60000 });
    await expect(setup.getByText("8 of 9 steps complete", { exact: true })).toBeVisible();
    await setup.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(setup.getByText("9 of 9 steps complete", { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(setup.getByText(/^Setup stopped\./)).toHaveCount(0);
    await expect(setup.getByRole("button", { name: "Resume setup", exact: true })).toHaveCount(0);
    const starts = await l.app.evaluate(() => Reflect.get(globalThis, "setupStepStarts"));
    expect(starts.filter((id: string) => id === "clone")).toHaveLength(1);
    expect(starts.filter((id: string) => id === "push")).toHaveLength(1);
    expect(readFileSync(retained, "utf8")).toBe("# Retained\n\nNever overwrite this note.\n");
    expect(w.git(join(workspace, "private"), "rev-parse", "HEAD")).toBe(w.git(join(w.remotes, "ada", "notes-private.git"), "rev-parse", "main"));
    expect(w.git(workspace, "rev-parse", "HEAD")).toBe(w.git(join(w.remotes, "ada", "notes.git"), "rev-parse", "main"));
  } finally {
    await closeTestApp(l);
    w.server.close();
  }
});

test("Site preview counts actual reads, cancels safely and retains Apply and local Publish recovery", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), before = readFileSync(note, "utf8");
  write(join(dirs.docs, "notes", "second.md"), "# Second\n\nAnother synthetic article.\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({
    version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note,
    sharingDrafts: { [dirs.docs]: { owner: "personal", people: [] } },
  }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Invoke handlers unavailable");
      const read: unknown = handlers.get("note:read"), save: unknown = handlers.get("state:save");
      if (typeof read !== "function" || typeof save !== "function") throw new Error("Note/state handlers unavailable");
      let reads = 0, writes = 0;
      ipcMain.removeHandler("access:load");
      ipcMain.handle("access:load", () => ({ available: true, localReview: true, site: "https://local.test/", vault: true, grants: [] }));
      ipcMain.removeHandler("note:read");
      ipcMain.handle("note:read", async (...args) => {
        const path: unknown = args[1];
        if (typeof path === "string" && path.endsWith("hello.md")) {
          if (++reads === 2) throw new Error("private-path-and-token");
          await new Promise<void>(resolve => Reflect.set(globalThis, "releaseSiteRead", resolve));
        }
        return read(...args);
      });
      ipcMain.removeHandler("state:save");
      ipcMain.handle("state:save", async (...args) => {
        Reflect.set(globalThis, "uiStatesSiteWrites", ++writes);
        if (writes === 1) throw new Error("EACCES private-path-and-token");
        await new Promise<void>(resolve => Reflect.set(globalThis, "releaseSiteSave", resolve));
        return save(...args);
      });
    });
    const release = (name: string) => l.app.evaluate((_electron, key) => {
      const fn: unknown = Reflect.get(globalThis, key);
      if (typeof fn !== "function") throw new Error(`Missing held operation ${key}`);
      Reflect.deleteProperty(globalThis, key); fn();
    }, name);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await settings.getByRole("button", { name: "Preview site…", exact: true }).click();
    await expect(settings.getByRole("progressbar")).toHaveAttribute("value", "0");
    await expect(settings.getByText(/^Preparing site preview… [3-9] s$/)).toBeVisible({ timeout: 6000 });
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Stopping after this step…", exact: true })).toHaveAttribute("aria-disabled", "true");
    await release("releaseSiteRead");
    await expect(settings.getByText("Preview stopped.", { exact: false })).toBeVisible();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    const failed = settings.locator("[data-status-row=danger]").filter({ hasText: "Couldn’t prepare this preview." });
    await expect(failed).toBeVisible();
    await expect(failed).not.toContainText("private-path-and-token");
    await failed.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(failed.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await release("releaseSiteRead");
    const preview = l.page.getByRole("region", { name: "Preview site", exact: true });
    await expect(preview).toBeVisible();
    await expect(preview.getByText("Second", { exact: true }).first()).toBeVisible();
    const readerFocus = preview.getByRole("switch", { name: "Focus", exact: true });
    const focusNode = await readerFocus.elementHandle();
    await readerFocus.focus(); await readerFocus.press("Space");
    await expect(readerFocus).toBeChecked();
    await expect(readerFocus).toBeFocused();
    expect(await focusNode!.evaluate(el => el.isConnected)).toBe(true);
    await readerFocus.press("Space");
    await expect(readerFocus).not.toBeChecked();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "uiStatesSiteWrites") ?? 0)).toBe(0);
    await preview.getByRole("radiogroup", { name: "Site theme", exact: true }).getByText("Sepia", { exact: true }).click();
    await preview.getByRole("button", { name: "Apply", exact: true }).click();
    const saveError = preview.locator("[data-status-row=danger]");
    await expect(saveError).toContainText("Your notes and choices are kept.");
    await saveError.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(preview.getByRole("progressbar")).toHaveAttribute("value", "50");
    await expect(preview.getByRole("button", { name: "Cancel", exact: true })).toHaveAttribute("aria-disabled", "true");
    await release("releaseSiteSave");
    await expect(settings).toBeVisible();
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.state), "utf8")).sharingDrafts[dirs.docs].theme).toBe("sepia");
    await l.page.keyboard.press("Escape");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Publish…", exact: true }).click();
    const publish = l.page.getByRole("dialog", { name: /Publish/ });
    await publish.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(publish.getByRole("progressbar")).toHaveAttribute("value", "50");
    await expect(publish).toContainText("Save local publication draft");
    await expect(l.page.getByRole("status").filter({ hasText: "Preparing publication…" })).toHaveCount(1);
    await release("releaseSiteSave");
    await expect(publish).toHaveCount(0);
    await expect(l.page.getByRole("status").filter({ hasText: "Saved to the local site preview." })).toHaveCount(1);
    await expect(l.page.getByRole("status").filter({ hasText: /^Done\.$/ })).toHaveCount(0);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.state), "utf8")).sharingDrafts[dirs.docs].published).toEqual([note]);
    expect(readFileSync(note, "utf8")).toBe(before);
    for (const measure of ["fn:site.preview", "fn:site.settings", "fn:sharing.publishDraft"]) {
      expect(await l.page.evaluate(name => performance.getEntriesByName(name).length, measure)).toBeGreaterThan(0);
    }
  } finally { await closeTestApp(l); }
});

test("Files initial scan is independent, never reports unknown or refused content empty and retries only the read", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md"), before = "# Welcome\n\nInitial listing stays independent.\n";
  writeFileSync(note, before);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const entrypoint = join(dirs.userData, "held-scan.cjs");
  const main = pathToFileURL(fileURLToPath(new URL("../out/main/main.mjs", import.meta.url))).href;
  writeFileSync(entrypoint, `
const { ipcMain } = require("electron");
const handle = ipcMain.handle.bind(ipcMain);
let scans = 0;
ipcMain.handle = (channel, handler) => handle(channel, channel !== "workspace:scan" ? handler : async (...args) => {
  const request = ++scans;
  await new Promise(resolve => { globalThis.uiStatesReleaseScan = resolve; });
  if (request === 1) throw new Error("private-path-and-token");
  return handler(...args);
});
import(${JSON.stringify(main)});
`);
  const l = await launch(dirs, {}, { entrypoint });
  try {
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Initial listing stays independent.");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+p" : "Control+Alt+p");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const body = await files.locator("[data-sheet-body]").elementHandle();
    if (!body) throw new Error("Files content wrapper is unavailable");
    const shapes = files.locator("[data-shimmer]");
    await expect(shapes).toHaveCount(3);
    await expect(files.getByText("No notes yet", { exact: true })).toHaveCount(0);
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationIterationCount)).toBe("3");
    await l.page.emulateMedia({ reducedMotion: "reduce" });
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
    const releaseScan = () => l.app.evaluate(() => {
      const release: unknown = Reflect.get(globalThis, "uiStatesReleaseScan");
      if (typeof release !== "function") throw new Error("Held initial scan is unavailable");
      Reflect.deleteProperty(globalThis, "uiStatesReleaseScan");
      release();
    });
    await releaseScan();
    const error = files.locator("[data-status-row=danger]");
    await expect(error).toContainText("Couldn't list your notes.");
    await expect(error).not.toContainText("private-path-and-token");
    await expect(shapes).toHaveCount(0);
    await expect(files.getByText("No notes yet", { exact: true })).toHaveCount(0);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    const filter = files.getByRole("searchbox", { name: "Filter by name", exact: true });
    await filter.fill("unmatched initial scan");
    await expect(error).toBeVisible();
    await expect(editor).toContainText("Initial listing stays independent.");
    await releaseScan();
    await expect(error).toHaveCount(0);
    await expect(filter).toHaveValue("unmatched initial scan");
    await expect(files.getByText("No matches", { exact: true })).toBeVisible();
    await files.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(fileRow(files.getByRole("tree", { name: "Notes and folders", exact: true }), "Welcome")).toBeVisible();
    expect(await body.evaluate(el => el.isConnected)).toBe(true);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:workspace.list").length)).toBe(2);
    expect(readFileSync(note, "utf8")).toBe(before);
  } finally { await closeTestApp(l); }
});

test("Recently deleted never calls failed history empty, retains rows through Retry and shows good news only after an acknowledged empty read", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  const before = readFileSync(note, "utf8");
  const gone = join(dirs.docs, "notes", "gone.md"), text = "# Gone\n\nSynthetic deleted note.\n";
  write(gone, text);
  git(dirs.docs, "add", "notes/gone.md");
  git(dirs.docs, "commit", "-q", "-m", "Add synthetic deleted note");
  git(dirs.docs, "rm", "-q", "notes/gone.md");
  git(dirs.docs, "commit", "-q", "-m", "Delete synthetic note");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("First line.");
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Electron invoke handlers are unavailable");
      const original: unknown = handlers.get("history:deleted");
      if (typeof original !== "function") throw new Error("Deleted history handler is unavailable");
      let reads = 0;
      ipcMain.removeHandler("history:deleted");
      ipcMain.handle("history:deleted", async (event, ...args: unknown[]) => {
        const request = ++reads;
        await new Promise(resolve => setTimeout(resolve, 900));
        if (request === 1 || request === 3) throw new Error("private-path-and-token");
        return original(event, ...args);
      });
    });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+p" : "Control+Alt+p");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const body = await files.locator("[data-sheet-body]").elementHandle();
    if (!body) throw new Error("Files content wrapper is unavailable");
    await files.getByRole("button", { name: /^Recently deleted/ }).click();
    const shapes = files.locator("[data-shimmer]");
    await expect(shapes).toHaveCount(3);
    await expect(files.getByText("Nothing deleted in the last 30 days.", { exact: true })).toHaveCount(0);
    const error = files.locator("[data-status-row=danger]");
    await expect(error).toContainText("Recently deleted couldn't be read.");
    await expect(error).not.toContainText("private-path-and-token");
    await expect(shapes).toHaveCount(0);
    await expect(files.locator("[data-status-row=success]")).toHaveCount(0);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(error).toBeVisible();
    await expect(files.getByText("Gone", { exact: true })).toBeVisible();
    await expect(error).toHaveCount(0);
    await files.getByRole("button", { name: "Browse files", exact: true }).click();
    await files.getByRole("button", { name: /^Recently deleted/ }).click();
    await expect(error).toBeVisible();
    await expect(files.getByText("Gone", { exact: true })).toBeVisible();
    await expect(files.locator("[data-status-row=success]")).toHaveCount(0);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(files.getByText("Gone", { exact: true })).toBeVisible();
    await expect(error).toHaveCount(0);
    await files.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(files.getByRole("tree", { name: "Notes and folders", exact: true })).toBeVisible();
    expect(readFileSync(gone, "utf8")).toBe(text);
    await files.getByRole("button", { name: /^Recently deleted/ }).click();
    await expect(files.locator("[data-status-row=success]")).toHaveText("Nothing deleted in the last 30 days.");
    await expect(error).toHaveCount(0);
    await expect(shapes).toHaveCount(0);
    expect(await body.evaluate(el => el.isConnected)).toBe(true);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:history.deleted").length)).toBe(5);
    expect(readFileSync(note, "utf8")).toBe(before);
  } finally { await closeTestApp(l); }
});

test("Files distinguishes collapsed content from no matches and replaces known-empty content in its own wrapper", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Welcome\n\nSynthetic first action.\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("Synthetic first action.");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+p" : "Control+Alt+p");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const body = await files.locator("[data-sheet-body]").elementHandle();
    if (!body) throw new Error("Files content wrapper is unavailable");
    const tree = files.getByRole("tree", { name: "Notes and folders", exact: true });
    const root = fileRow(tree, "Notes");
    await root.click();
    await root.press("ArrowLeft");
    await expect(root).toHaveAttribute("aria-expanded", "false");
    await expect(files.getByText("No notes yet", { exact: true })).toHaveCount(0);
    const filter = files.getByRole("searchbox", { name: "Filter by name", exact: true });
    await filter.fill("no-such-note");
    await expect(files.getByText("No matches", { exact: true })).toBeVisible();
    const filteredEmpty = files.locator("[data-tone=neutral]").filter({ hasText: "No matches" });
    expect(await filteredEmpty.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBe(32);
    await files.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(filter).toHaveValue("");
    await expect(files.getByText("No matches", { exact: true })).toHaveCount(0);
    await expect(files.getByText("No notes yet", { exact: true })).toHaveCount(0);
    await root.click();
    await root.press("ArrowRight");
    await expect(fileRow(tree, "Welcome")).toBeVisible();
    rmSync(note);
    await expect(files.getByText("No notes yet", { exact: true })).toBeVisible();
    const firstUse = files.locator("[data-tone=neutral]").filter({ hasText: "No notes yet" });
    expect(await firstUse.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBe(160);
    expect(await firstUse.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(160);
    await files.getByRole("button", { name: "New note", exact: true }).filter({ hasText: "New note" }).click();
    await expect(files.getByText("No notes yet", { exact: true })).toHaveCount(0);
    await expect(tree.getByRole("treeitem").filter({ hasText: "Untitled" }).first()).toBeVisible();
    expect(await body.evaluate(el => el.isConnected)).toBe(true);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:workspace.list").length)).toBe(1);
  } finally { await closeTestApp(l); }
});

test("Sharing settings distinguish failed and filtered lists, retain rows and route the known-empty first action without writes", async () => {
  const { dirs } = instance();
  const note = join(dirs.docs, "private", "notes", "welcome.md"), before = readFileSync(note, "utf8");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const entrypoint = join(dirs.userData, "sharing-list-fixture.cjs");
  const main = pathToFileURL(fileURLToPath(new URL("../out/main/main.mjs", import.meta.url))).href;
  writeFileSync(entrypoint, `
const { ipcMain } = require("electron");
const register = ipcMain.handle.bind(ipcMain);
let reads = 0;
globalThis.uiStatesSharingWrites = 0;
const firstRead = new Promise(resolve => { globalThis.releaseSharingFirstRead = resolve; });
ipcMain.handle = (channel, listener) => {
  if (channel === "access:apply") return register(channel, () => {
    globalThis.uiStatesSharingWrites++;
    throw new Error("Listing must not change grants");
  });
  if (channel !== "access:load") return register(channel, listener);
  return register(channel, async () => {
    const request = ++reads;
    if (request === 1) await firstRead;
    else await new Promise(resolve => setTimeout(resolve, 900));
    if (request === 1 || request === 4) throw new Error("private-path-and-token");
    return { available: true, localReview: false, site: "https://sharing.test/", vault: true, grants: request === 2 ? [] : [{
      id: "ghistory001", name: "Welcome", scope: { all: false, notes: ["welcome.md"], folders: [] },
      createdAt: "2026-10-01T00:00:00.000Z", link: true, passcode: false, generated: false,
      item: { path: "welcome.md", label: "Welcome", folder: false, includeLater: false },
    }] };
  });
};
import(${JSON.stringify(main)});
`);
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" }, { entrypoint });
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    const body = await settings.elementHandle();
    if (!body) throw new Error("Settings content wrapper is unavailable");
    const shapes = settings.locator("[data-shimmer]");
    await expect(settings.locator("[data-item-card][data-skeleton]")).toHaveCount(3);
    await expect(shapes).toHaveCount(9);
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationIterationCount)).toBe("3");
    await l.page.emulateMedia({ reducedMotion: "reduce" });
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
    const empty = settings.getByText("Nothing shared yet", { exact: true });
    await expect(empty).toHaveCount(0);
    await l.app.evaluate(() => {
      const release: unknown = Reflect.get(globalThis, "releaseSharingFirstRead");
      if (typeof release !== "function") throw new Error("Sharing fixture read is unavailable");
      release();
    });
    const error = settings.locator("[data-status-row=danger]");
    await expect(error).toContainText("Your notes and shares weren't changed.");
    await expect(error).not.toContainText("private-path-and-token");
    await expect(empty).toHaveCount(0);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(error).toBeVisible();
    await expect(empty).toBeVisible();
    expect(await body.evaluate(el => el.isConnected)).toBe(true);
    await settings.getByRole("button", { name: "Open Files", exact: true }).click();
    await expect(settings).toHaveCount(0);
    await expect(l.page.getByRole("complementary", { name: "Files", exact: true })).toBeVisible();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    const row = settings.locator("[data-item-card]").filter({ hasText: "Welcome" });
    await expect(row).toHaveCount(1);
    const filter = settings.getByRole("searchbox", { name: "Find by item", exact: true });
    await filter.fill("unmatched share");
    await settings.getByRole("radiogroup", { name: "Show", exact: true }).getByText("Withdrawn", { exact: true }).click();
    await expect(settings.getByText("No matches", { exact: true })).toBeVisible();
    await expect(empty).toHaveCount(0);
    await settings.getByRole("button", { name: "Clear filters", exact: true }).click();
    await expect(filter).toHaveValue("");
    await expect(settings.getByRole("radio", { name: "All", exact: true })).toBeChecked();
    await expect(row).toHaveCount(1);
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await settings.getByRole("tab", { name: "Sharing", exact: true }).click();
    await expect(row).toHaveCount(1);
    await expect(shapes).toHaveCount(0);
    await expect(error).toBeVisible();
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await filter.fill("Welcome");
    await expect(row).toHaveCount(1);
    await expect(error).toHaveCount(0);
    await expect(filter).toHaveValue("Welcome");
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:sharing.list").length)).toBe(5);
    expect(await l.app.evaluate(() => Number(Reflect.get(globalThis, "uiStatesSharingWrites")))).toBe(0);
    expect(readFileSync(note, "utf8")).toBe(before);
  } finally { await closeTestApp(l); }
});

test("Share item delays its own section, retains choices and history through failed reads and scoped Retry", async () => {
  const { dirs } = instance();
  await configureSharing(dirs);
  const note = join(dirs.docs, "private", "notes", "welcome.md");
  const before = readFileSync(note, "utf8");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("First line.");
    const outcomes = await sectionOutcomes(l);
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Electron invoke handlers are unavailable");
      const original: unknown = handlers.get("access:load");
      if (typeof original !== "function") throw new Error("Sharing read handler is unavailable");
      let reads = 0;
      Reflect.set(globalThis, "uiStatesShareWrites", 0);
      ipcMain.removeHandler("access:apply");
      ipcMain.handle("access:apply", () => {
        Reflect.set(globalThis, "uiStatesShareWrites", Number(Reflect.get(globalThis, "uiStatesShareWrites")) + 1);
        throw new Error("Sharing preparation must not mutate grants");
      });
      ipcMain.removeHandler("access:load");
      ipcMain.handle("access:load", async (event, ...args: unknown[]) => {
        const request = ++reads;
        await new Promise(resolve => setTimeout(resolve, 1100));
        if ([1, 2, 4, 5].includes(request)) throw new Error("private-path-and-token");
        const listing = await original(event, ...args);
        return { ...listing, available: true, localReview: false, site: "https://sharing.test/", vault: true, grants: [{
          id: "ghistory001", name: "Welcome", scope: { all: false, notes: ["welcome.md"], folders: [] },
          createdAt: "2026-10-01T00:00:00.000Z", link: true, passcode: false, generated: false,
          item: { path: "welcome.md", label: "Welcome", folder: false, includeLater: false },
        }] };
      });
    });
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
      await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
      await l.page.getByRole("menuitem", { name: "Share…", exact: true }).click();
    };
    await open();
    const share = l.page.getByRole("dialog", { name: "Share “Welcome”", exact: true });
    const shapes = share.locator("[data-shimmer]");
    await expect(shapes).toHaveCount(3);
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationIterationCount)).toBe("3");
    await l.page.emulateMedia({ reducedMotion: "reduce" });
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
    const expiry = share.getByRole("radiogroup", { name: "Expires in", exact: true });
    await expiry.getByText("7 days", { exact: true }).click();
    const error = share.locator("[data-status-row=danger]");
    const failure = "Sharing isn’t ready for this project. Your notes weren’t changed. Try again.";
    await expect(error).toContainText(failure);
    await expect(shapes).toHaveCount(0);
    await expect(error).not.toContainText("private-path-and-token");
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(1);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.evaluate(el => Reflect.set(globalThis, "uiStatesRetainedShareError", el));
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expiry.getByText("90 days", { exact: true }).click();
    await expect(error).toBeVisible();
    await expect(share.getByRole("radio", { name: "90 days", exact: true })).toBeChecked();
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(2);
    expect(await error.evaluate(el => el === Reflect.get(globalThis, "uiStatesRetainedShareError"))).toBe(true);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    const history = share.getByRole("button", { name: "Shared before · 1", exact: true });
    await expect(history).toBeVisible();
    await expect(error).toHaveCount(0);
    await l.page.keyboard.press("Escape");
    await open();
    await expect(history).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect(error).toContainText(failure);
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(3);
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(history).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(4);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error).toHaveCount(0);
    await expect(history).toBeVisible();
    expect(await l.app.evaluate(() => Number(Reflect.get(globalThis, "uiStatesShareWrites")))).toBe(0);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:share.item.prepare").length)).toBe(6);
    await l.page.keyboard.press("Escape");
    await expect(editor).toContainText("First line.");
    expect(readFileSync(note, "utf8")).toBe(before);
  } finally { await closeTestApp(l); }
});

test("History delays its own section, retries exact reads and acknowledges restore and Undo only after saving", async () => {
  const { dirs } = instance();
  const repository = join(dirs.docs, "private"), note = join(repository, "notes", "welcome.md");
  const before = "# Welcome\n\nFirst line.\n\nLater paragraph.\n";
  write(note, before);
  git(repository, "commit", "-q", "-am", "Save later paragraph");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_IDLE_COMMIT_MS: "600000" });
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Later paragraph.");
    const outcomes = await sectionOutcomes(l);
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Electron invoke handlers are unavailable");
      for (const channel of ["history:versions", "history:version", "note:write"]) {
        const original: unknown = handlers.get(channel);
        if (typeof original !== "function") throw new Error(`Missing ${channel}`);
        let attempts = 0;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (event, ...args: unknown[]) => {
          const attempt = ++attempts;
          await new Promise(resolve => setTimeout(resolve, channel === "note:write" ? 600 : 1100));
          if (attempt === 1 || channel !== "note:write" && attempt === 2 || channel === "note:write" && attempt === 3) throw new Error("private-path-and-token");
          return original(event, ...args);
        });
      }
    });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Note history", exact: true }).click();
    const sheet = l.page.getByRole("complementary", { name: "Note history", exact: true });
    await expect(sheet.locator("[data-shimmer]").first()).toBeVisible();
    await expect(editor).toContainText("Later paragraph.");
    const error = sheet.locator("[data-status-row=danger]");
    await expect(error).toContainText("Couldn't read this note's history.");
    const listFailure = "Couldn't read this note's history.", versionFailure = "Couldn't read that version.";
    await expect.poll(async () => (await outcomes()).filter(text => text === listFailure)).toHaveLength(1);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect.poll(async () => (await outcomes()).filter(text => text === listFailure)).toHaveLength(2);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(sheet.getByRole("option")).toHaveCount(2);
    await expect(error).not.toBeVisible();
    await sheet.getByRole("option").last().click();
    await expect(sheet.locator("#historyVersionLoading [data-shimmer]").first()).toBeVisible();
    await expect(error).toContainText("Couldn't read that version.");
    await error.getByText("Details", { exact: true }).click();
    await expect(error).not.toContainText("private-path-and-token");
    await expect.poll(async () => (await outcomes()).filter(text => text === versionFailure)).toHaveLength(1);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect.poll(async () => (await outcomes()).filter(text => text === versionFailure)).toHaveLength(2);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    const preview = sheet.getByRole("region", { name: /^Viewing the version from / });
    await expect(preview).toContainText("First line.");
    await expect(preview).not.toContainText("Later paragraph.");
    await expect(error).not.toBeVisible();
    await sheet.getByRole("button", { name: "Restore this version", exact: true }).click();
    await expect(error).toContainText("Couldn't save the restored version.");
    expect(readFileSync(note, "utf8")).toBe(before);
    await expect(preview).toBeVisible();
    await expect(l.page.locator("#toasts")).not.toContainText("Restored the version from");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(sheet).not.toBeVisible();
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nFirst line.\n");
    const toasts = l.page.locator("#toasts");
    await toasts.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(toasts).toContainText("Couldn't save Undo.");
    expect(readFileSync(note, "utf8")).toBe("# Welcome\n\nFirst line.\n");
    await toasts.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => readFileSync(note, "utf8")).toBe(before);
    await expect(editor).toContainText("Later paragraph.");
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:history.list").length)).toBe(3);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:history.version").length)).toBe(3);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:history.restore").length)).toBe(2);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:history.undo").length)).toBe(2);
  } finally { await closeTestApp(l); }
});

test("Broken images keep their alt and scoped Retry, coalesce notices and recover actual reads and decodes", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "images.md");
  const markdown = "# Image recovery\n\n![First image](a.png)\n\n![Second image](b.png)\n";
  writeFileSync(note, markdown);
  writeFileSync(join(dirs.docs, "b.png"), "invalid image bytes");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const first = l.page.getByRole("group", { name: "First image", exact: true });
    const second = l.page.getByRole("group", { name: "Second image", exact: true });
    await expect(first).toContainText("This image couldn't be read.");
    await expect(second).toContainText("This image couldn't be read.");
    const notice = l.page.locator("#toasts").getByRole("alert").filter({ hasText: "Some images couldn't be read." });
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("(2)");
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Electron invoke handlers are unavailable");
      const original: unknown = handlers.get("image:read");
      if (typeof original !== "function") throw new Error("Image reader unavailable");
      ipcMain.removeHandler("image:read");
      ipcMain.handle("image:read", async (event, ...args: unknown[]) => {
        await new Promise(resolve => setTimeout(resolve, 600));
        return original(event, ...args);
      });
    });
    const retry = first.getByRole("button", { name: "Retry", exact: true });
    await retry.focus();
    await l.page.keyboard.press("Enter");
    await expect(first.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(first.getByRole("button")).toBeFocused();
    await expect(first).toContainText("First image");
    await expect(retry).toBeVisible();
    await expect(retry).toBeFocused();
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText("(2)");
    const png = Buffer.from(picture().split(",")[1]!, "base64");
    writeFileSync(join(dirs.docs, "a.png"), png);
    writeFileSync(join(dirs.docs, "b.png"), png);
    await retry.click();
    await expect(first.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(second.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    const loadedFirst = l.page.getByRole("img", { name: "First image", exact: true });
    await expect.poll(() => loadedFirst.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 128)).toBe(true);
    await second.getByRole("button", { name: "Retry", exact: true }).click();
    const loadedSecond = l.page.getByRole("img", { name: "Second image", exact: true });
    await expect.poll(() => loadedSecond.evaluate(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 128)).toBe(true);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:image.read").length)).toBe(5);
    expect(readFileSync(note, "utf8")).toBe(markdown);
    expect(readFileSync(join(dirs.docs, "a.png"))).toEqual(png);
    expect(readFileSync(join(dirs.docs, "b.png"))).toEqual(png);
  } finally { await closeTestApp(l); }
});

test("New project streams actual setup steps and Close keeps the partial folder without opening or replaying it", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "Welcome.md");
  const parent = join(dirs.userData, "creation-parent");
  mkdirSync(parent);
  const bytes = "# Exact original\n\nCancel must keep this note.\n";
  writeFileSync(note, bytes);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note }));
  let release: (() => void) | undefined, creates = 0;
  const server = createServer((req, res) => {
    const send = (body: unknown) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url === "/user") return send({ login: "local", id: 1, name: "Local" });
    if (req.url === "/user/repos" && req.method === "POST") {
      creates++;
      req.resume();
      release = () => { release = undefined; send({}); };
      return;
    }
    if (creates && req.url === "/repos/local/streamed-project") return send({ owner: { login: "local" }, name: "streamed-project", private: true, default_branch: "main" });
    res.writeHead(404); res.end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local project server did not bind");
  let l: Launched | undefined;
  try {
    l = await launch(dirs, { FOCUS_NOTES_CANDIDATE_GITHUB_API: `http://127.0.0.1:${address.port}` });
    expect(await l.app.evaluate(({ BrowserWindow }, opacity) => BrowserWindow.getAllWindows().every(window => window.getOpacity() === opacity), journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1)).toBe(true);
    await l.app.evaluate(({ ipcMain }, folder) => {
      ipcMain.removeHandler("projects:parent");
      ipcMain.handle("projects:parent", () => folder);
      ipcMain.removeHandler("firstRun:account");
      ipcMain.handle("firstRun:account", () => ({ account: { login: "local", id: 1, name: "Local" }, gcm: false, gh: false }));
    }, parent);
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    await l.page.getByRole("dialog", { name: "Open", exact: true }).getByRole("button", { name: "New project…", exact: true }).click();
    const project = l.page.getByRole("dialog", { name: "New project", exact: true });
    await project.getByRole("textbox", { name: "Project name", exact: true }).fill("Streamed project");
    await project.getByRole("button", { name: "Next", exact: true }).click();
    await project.getByRole("radio", { name: "On GitHub", exact: true }).click();
    for (let i = 0; i < 2; i++) await project.getByRole("button", { name: "Next", exact: true }).click();
    await project.getByRole("button", { name: "Create project", exact: true }).click();
    const progress = project.getByRole("progressbar");
    await expect.poll(() => Boolean(release)).toBe(true);
    // The folder, history and profile are kept before the held repository request.
    await expect(progress).toHaveAttribute("aria-label", "4 of 7 steps completed");
    await expect(progress).toHaveAttribute("value", "57");
    await expect(project.locator("[data-step-mark][data-step-mark-size=compact] [data-busy]")).toHaveCount(1);
    const close = project.getByRole("button", { name: "Close", exact: true });
    await expect(project.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(close).toBeInViewport();
    await close.click();
    await expect(project).toBeVisible();
    await expect(progress).toHaveAttribute("value", "57");
    if (!release) throw new Error("Repository creation was not held");
    release();
    await expect(project.locator("[data-status-row=danger]")).toContainText("Completed files and your choices are kept.");
    await expect(project.getByRole("button", { name: "Create project", exact: true })).toBeDisabled();
    await expect(close).toBeInViewport();
    expect(creates).toBe(1);
    const folder = join(parent, "Streamed project");
    expect(readdirSync(folder).sort()).toEqual([".focus-notes", ".git", "notes"]);
    expect(readFileSync(note, "utf8")).toBe(bytes);
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await close.click();
    await expect(project).toBeHidden();
    expect(readFileSync(note, "utf8")).toBe(bytes);
    expect(readdirSync(folder).sort()).toEqual([".focus-notes", ".git", "notes"]);
  } finally {
    release?.();
    if (l) await closeTestApp(l);
    rmSync(parent, { recursive: true, force: true });
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("New project and Local import recover without repeating completed creation or copying a partial note", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "local-draft.md");
  writeFileSync(note, "# Local draft\n\nKeep these exact bytes.\n");
  const before = readFileSync(note);
  const destination = join(dirs.userData, "Imported");
  const notes = join(destination, "notes"), held = `${notes}.held`;
  mkdirSync(notes, { recursive: true });
  const targetProfile = join(dirs.userData, DATA_FOLDERS.projectProfiles, "synthetic-import");
  mkdirSync(targetProfile, { recursive: true });
  writeFileSync(join(targetProfile, DATA_FILES.projectFolder), destination);
  writeFileSync(join(targetProfile, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done" }));
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", localNotes: true, projectIntroSeen: true, lastNotePath: note }));
  const l = await launch(dirs, { FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_LOCAL_NOTES_HOME: dirs.docs });
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await l.page.getByRole("toolbar", { name: "Toolbar", exact: true }).getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitem", { name: "Import into project…", exact: true }).click();
    const sheet = l.page.getByRole("dialog", { name: "Import into project", exact: true });
    renameSync(notes, held); writeFileSync(notes, "blocked directory");
    await sheet.getByRole("option", { name: /Imported/ }).click();
    const failure = sheet.locator("[data-status-row=danger]");
    await expect(failure).toContainText("Your Local note is unchanged.");
    expect(readFileSync(note)).toEqual(before);
    rmSync(notes); renameSync(held, notes);
    await failure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(sheet).not.toBeVisible();
    expect(readdirSync(notes)).toEqual(["local-draft.md"]);
    expect(readFileSync(join(notes, "local-draft.md"))).toEqual(before);
    expect(readFileSync(note)).toEqual(before);

    await l.app.evaluate(({ ipcMain }, folder) => {
      let creates = 0, opens = 0;
      ipcMain.removeHandler("projects:check");
      ipcMain.handle("projects:check", (_event, _parent, name) => ({ folder: `${folder}\\${name}`, problem: "" }));
      ipcMain.removeHandler("projects:create");
      ipcMain.handle("projects:create", () => { Reflect.set(globalThis, "fnUiStatesCreates", ++creates); return folder; });
      ipcMain.removeHandler("projects:open");
      ipcMain.handle("projects:open", async () => {
        if (++opens === 1) throw new Error("sensitive diagnostic notFound");
        await new Promise(resolve => setTimeout(resolve, 600));
      });
    }, destination);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    await l.page.getByRole("dialog", { name: "Open", exact: true }).getByRole("button", { name: "New project…", exact: true }).click();
    const project = l.page.getByRole("dialog", { name: "New project", exact: true });
    await project.getByRole("textbox", { name: "Project name", exact: true }).fill("Kept project choices");
    for (let i = 0; i < 3; i++) await project.getByRole("button", { name: "Next", exact: true }).click();
    await project.getByRole("button", { name: "Create project", exact: true }).click();
    const projectFailure = project.locator("[data-status-row=danger]");
    await expect(projectFailure).toContainText("The project was created but couldn’t open.");
    expect(await project.innerText()).not.toContain("sensitive diagnostic");
    await projectFailure.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(projectFailure.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(project.getByRole("heading", { name: "Kept project choices", exact: true })).toBeVisible();
    await expect(project).not.toBeVisible();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "fnUiStatesCreates"))).toBe(1);
    expect(readFileSync(note)).toEqual(before);
    expect(readdirSync(notes)).toEqual(["local-draft.md"]);
  } finally {
    if (existsSync(held)) { if (existsSync(notes)) rmSync(notes); renameSync(held, notes); }
    await closeTestApp(l);
  }
});

test("AI details commit independently and key Save checks before persistence, retaining failures and secrets locally", async () => {
  test.setTimeout(120_000);
  const dirs = tempDirs();
  const file = join(dirs.userData, DATA_FILES.ai), backup = `${file}.before-failure`;
  const note = join(dirs.docs, "ai-commits.md");
  writeFileSync(note, "# AI commits\n\nThese note words must never enter a key check.\n");
  const noteBytes = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const requests: string[] = [];
  let hold = true, status = 200, respond: (() => void) | undefined;
  const release = () => { const finish = respond; respond = undefined; finish?.(); };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += String(chunk); });
    req.on("end", () => {
      requests.push(body);
      const finish = () => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
      };
      if (hold) respond = finish; else finish();
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Synthetic provider did not bind");
  writeFileSync(file, JSON.stringify({
    version: 2, writer: "synthetic",
    connections: [{ id: "synthetic", provider: "compatible", name: "AI writing", endpoint: `http://127.0.0.1:${address.port}/v1`, model: "model-a", deployment: "", apiVersion: "", account: "" }],
  }));
  const saved = () => JSON.parse(readFileSync(file, "utf8")).connections[0] as { name: string; model: string; key?: string };
  const restore = () => {
    if (existsSync(file) && statSync(file).isDirectory()) rmSync(file, { recursive: true });
    if (existsSync(backup)) renameSync(backup, file);
  };
  let l: Launched | undefined;
  try {
    l = await launch(dirs);
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    await settings.getByRole("button", { name: "Change", exact: true }).click();
    await expect(settings.getByText("Connection details", { exact: true })).toBeVisible();
    await expect(settings.getByText("Access key", { exact: true })).toBeVisible();
    const name = settings.getByRole("textbox", { name: "Name", exact: true });
    const model = settings.getByRole("textbox", { name: "Model", exact: true });
    await name.fill("Kept writing connection");
    renameSync(file, backup); mkdirSync(file);
    await name.press("Tab");
    await expect(settings.getByText("Couldn't save this change. What you typed is still here.", { exact: true })).toBeVisible();
    await expect(name).toHaveValue("Kept writing connection");
    restore();
    await model.fill("model-b"); await model.press("Tab");
    await expect.poll(() => saved().model).toBe("model-b");
    expect(saved().name).toBe("AI writing");
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().name).toBe("Kept writing connection");
    expect(requests).toHaveLength(0);

    const key = settings.getByLabel("API key (optional)", { exact: true });
    await key.fill("synthetic-key-one");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    const checking = settings.getByRole("button", { name: "Checking key…", exact: true });
    await expect(checking).toHaveAttribute("aria-busy", "true");
    await expect(key).toHaveAttribute("readonly", "");
    expect(saved().key).toBeUndefined();
    await expect(key).toHaveValue("synthetic-key-one");
    await name.fill("Independent during key check"); await name.press("Tab");
    await expect.poll(() => saved().name).toBe("Independent during key check");
    expect(saved().key).toBeUndefined();
    release();
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toBeVisible();
    await expect(key).toHaveValue("");
    const sealed = saved().key;
    expect(sealed).toBeTruthy();
    expect(readFileSync(file, "utf8")).not.toContain("synthetic-key-one");
    await expect(settings.getByRole("button", { name: "Save key", exact: true })).toBeVisible();

    hold = false; status = 401;
    await key.fill("synthetic-key-two");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    const kept = settings.getByText(/Your entry is kept here\. The saved key is unchanged/);
    await expect(kept).toBeVisible();
    await expect(key).toHaveValue("synthetic-key-two");
    expect(saved().key).toBe(sealed);
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toHaveCount(0);

    status = 200; hold = true;
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => requests.length).toBe(3);
    renameSync(file, backup); mkdirSync(file);
    release();
    await expect(settings.getByRole("button", { name: "Save key", exact: true }).locator("[data-border-progress]")).toHaveAttribute("data-border-progress", "failed");
    await expect(key).toHaveValue("synthetic-key-two");
    restore();
    expect(saved().key).toBe(sealed);
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(key).toHaveValue("");
    expect(requests).toHaveLength(3);
    expect(saved().key).toBe(sealed);

    hold = false;
    await key.fill("synthetic-key-two");
    await settings.getByRole("button", { name: "Save key", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Access key saved", exact: true })).toBeVisible();
    await expect(key).toHaveValue("");
    expect(saved().key).not.toBe(sealed);
    for (const body of requests) {
      expect(JSON.parse(body)).toMatchObject({ messages: [{ role: "system", content: "Reply with the single word OK." }, { role: "user", content: "Connection test." }] });
      expect(body).not.toContain("These note words");
    }
    expect(await settings.innerText()).not.toContain("synthetic-key");
    expect(readFileSync(note)).toEqual(noteBytes);
    await key.fill("do-not-carry-to-another-destination");
    const endpoint = settings.getByRole("textbox", { name: "Address", exact: true });
    await endpoint.fill(`http://127.0.0.1:${address.port}/v2`); await endpoint.press("Tab");
    await expect(key).toHaveValue("");
    await expect.poll(() => saved().key).toBeUndefined();
    expect(requests).toHaveLength(4);
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Change", exact: true })).toBeVisible();
  } finally {
    release(); restore();
    if (l) await closeTestApp(l);
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("known-empty wrappers keep their first actions local and filtered Open can clear its search", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "AI", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).toBeVisible();
    await expect(settings.getByText("Connect an app or API you already use.", { exact: true })).toBeVisible();
    const settingsBody = await settings.elementHandle();
    const aiEmpty = settings.locator("[data-tone=neutral]").filter({ hasText: "No AI connections" });
    expect(await aiEmpty.evaluate(el => parseFloat(getComputedStyle(el).minHeight))).toBe(160);
    await settings.getByRole("button", { name: "Add connection", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).not.toBeVisible();
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings.getByText("No AI connections", { exact: true })).toBeVisible();
    await settings.getByRole("button", { name: "Add connection", exact: true }).click();
    await settings.getByRole("button", { name: "Service", exact: true }).click();
    await l.page.getByRole("menuitemcheckbox", { name: "GitHub Copilot (on this computer)", exact: true }).click();
    await expect(settings.getByRole("textbox", { name: "Model", exact: true })).toHaveValue("auto");
    await settings.getByRole("button", { name: "Done", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Change", exact: true })).toBeVisible();
    await expect(settings.getByText("No AI connections", { exact: true })).toHaveCount(0);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.ai), "utf8")).connections).toHaveLength(1);
    await settings.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(aiEmpty).toBeVisible();
    await expect(aiEmpty.getByRole("button", { name: "Add connection", exact: true })).toBeVisible();
    expect(await settingsBody!.evaluate(el => el.isConnected)).toBe(true);
    expect(JSON.parse(readFileSync(join(dirs.userData, DATA_FILES.ai), "utf8")).connections).toHaveLength(0);
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    await expect(open).toBeVisible();
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("No matching projects");
    await expect(open.getByText("No matches", { exact: true }).first()).toBeVisible();
    await open.getByRole("button", { name: "Clear search", exact: true }).first().click();
    await expect(search).toHaveValue("");
    await expect(open.getByText("No matches", { exact: true })).toHaveCount(0);
    await expect(open).toBeVisible();
  } finally { await closeTestApp(l); }
});

test("Colour contrast all-done replaces failures with one success row and keeps the editor intact", async () => {
  const dirs = tempDirs(), note = join(dirs.docs, "colours.md"), before = "# Colour review\n\nKeep these exact note bytes.\n";
  writeFileSync(note, before);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", appearance: "light", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Keep these exact note bytes.");
    const editorNode = await editor.elementHandle();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    await theme.getByRole("tab", { name: "Edit colors", exact: true }).click();
    const good = theme.locator("[data-status-row=success]").filter({ hasText: "Every pair is easy to read" });
    await expect(good).toBeVisible();
    await expect(good.getByRole("button")).toHaveCount(0);
    const text = theme.getByRole("textbox", { name: "Text", exact: true });
    await l.app.evaluate(({ ipcMain }) => {
      const handlers: unknown = Reflect.get(ipcMain, "_invokeHandlers");
      if (!(handlers instanceof Map)) throw new Error("Invoke handlers unavailable");
      const save: unknown = handlers.get("state:save");
      if (typeof save !== "function") throw new Error("State handler unavailable");
      Reflect.set(globalThis, "uiStatesColourWrites", 0);
      ipcMain.removeHandler("state:save");
      ipcMain.handle("state:save", (...args) => {
        Reflect.set(globalThis, "uiStatesColourWrites", Number(Reflect.get(globalThis, "uiStatesColourWrites")) + 1);
        return save(...args);
      });
    });
    await text.fill("#b5b0a8"); await text.press("Enter");
    await expect(good).toHaveCount(0);
    await theme.getByRole("button", { name: "Fix Text", exact: true }).click();
    await expect(good).toBeVisible();
    await expect(theme.getByRole("status").filter({ hasText: /^Every pair is easy to read$/ })).toHaveCount(1);
    await expect(good.getByRole("button")).toHaveCount(0);
    expect(await editorNode!.evaluate(el => el.isConnected)).toBe(true);
    expect(readFileSync(note, "utf8")).toBe(before);
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "uiStatesColourWrites"))).toBe(0);
    expect(await l.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally { await closeTestApp(l); }
});

test("same-project Open retains the current note after a rejected read and closes only after accepted Retry", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "current.md"), target = join(dirs.docs, "target.md");
  writeFileSync(note, "# Current\n\nKept while opening.\n");
  writeFileSync(target, "# Target\n\nAccepted only after Retry.\n");
  const before = readFileSync(note), targetBefore = readFileSync(target);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.app.evaluate(({ ipcMain }, input) => {
      let reads = 0;
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", () => [{ folder: input.folder, name: "Current project", accent: "teal", logo: "book", lastNote: input.target }]);
      ipcMain.removeHandler("note:read");
      ipcMain.handle("note:read", async (_event, path) => {
        if (path !== input.target) return "# Current\n\nKept while opening.\n";
        if (++reads === 1) throw new Error("readOnly");
        await new Promise(resolve => setTimeout(resolve, 600));
        return "# Target\n\nAccepted only after Retry.\n";
      });
    }, { folder: dirs.docs, target });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("target");
    await open.getByRole("button", { name: "Open target", exact: true }).click();
    const row = open.locator("[data-status-row=danger]");
    await expect(row).toContainText("The project couldn’t be opened.");
    await expect(search).toHaveValue("target");
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Kept while opening.");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(editor).toContainText("Kept while opening.");
    await expect(open).not.toBeVisible();
    await expect(editor).toContainText("Accepted only after Retry.");
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:project.open").length)).toBe(2);
    expect(await l.page.evaluate(() => performance.getEntriesByName("fn:project.list").length)).toBeGreaterThan(0);
    expect(readFileSync(note)).toEqual(before);
    expect(readFileSync(target)).toEqual(targetBefore);
  } finally { await closeTestApp(l); }
});

test("Open retries the failed action in place, keeps input and never repeats a completed pin", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "open-recovery.md");
  writeFileSync(note, "# Open recovery\n\nThese exact note bytes stay here.\n");
  const before = readFileSync(note);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await (await l.page.context().newCDPSession(l.page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await l.app.evaluate(({ ipcMain }, folder) => {
      let reads = 0, pins = 0, opens = 0, failRefresh = false;
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", async () => {
        const request = ++reads;
        if (request === 2 || failRefresh) { failRefresh = false; throw new Error("sensitive diagnostic must stay hidden readOnly"); }
        if (request === 3) await new Promise(resolve => setTimeout(resolve, 600));
        return [{ folder, name: "Book", accent: "teal", logo: "book", pinned: pins > 0 }];
      });
      ipcMain.removeHandler("projects:pin");
      ipcMain.handle("projects:pin", () => { pins++; failRefresh = true; Reflect.set(globalThis, "fnUiStatesPinCount", pins); });
      ipcMain.removeHandler("projects:open");
      ipcMain.handle("projects:open", () => { if (++opens === 1) throw new Error("notFound"); });
    }, join(dirs.docs, "Synthetic Book"));
    const shortcut = process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o";
    await l.page.keyboard.press(shortcut);
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    const book = open.getByRole("button", { name: "Open Book", exact: true });
    await expect(book).toBeVisible();
    const search = open.getByRole("searchbox", { name: "Find a file or project", exact: true });
    await search.fill("Book");
    await l.page.keyboard.press(shortcut);
    const row = open.locator("[data-status-row=danger]");
    await expect(row).toContainText("Your projects couldn’t be listed. Your notes weren’t changed. Try again.");
    await row.getByText("Details", { exact: true }).click();
    await expect(row).toContainText("The system refused access to this location.");
    expect(await open.innerText()).not.toContain("sensitive diagnostic");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(row.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(book).toBeVisible();
    await expect(search).toHaveValue("Book");
    await expect(row.locator("details")).toHaveAttribute("open", "");
    await expect(row).toHaveCount(0);
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("Book");

    await open.getByRole("button", { name: "Pin Book", exact: true }).click();
    await expect(row).toContainText("The pin was changed, but the list couldn’t be refreshed.");
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(open.getByRole("button", { name: "Unpin Book", exact: true })).toBeVisible();
    expect(await l.app.evaluate(() => Reflect.get(globalThis, "fnUiStatesPinCount"))).toBe(1);

    await book.click();
    await expect(row).toContainText("The project couldn’t be opened. Your notes weren’t changed.");
    await expect(open).toBeVisible();
    expect(readFileSync(note)).toEqual(before);
    await row.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(open).not.toBeVisible();
    expect(readFileSync(note)).toEqual(before);
    await expect(l.page.getByRole("textbox", { name: "Note", exact: true })).toContainText("These exact note bytes stay here.");
  } finally { await closeTestApp(l); }
});

test("Open shows each pin's own-border pending arc while it saves, then confirms the new state, for projects and files", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "open-pin.md");
  writeFileSync(note, "# Open pin\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    await l.app.evaluate(({ ipcMain }, folder) => {
      const pins = new Set<string>();
      const draft = `${folder}\\notes\\Draft.md`;
      ipcMain.removeHandler("projects:list");
      ipcMain.handle("projects:list", () => [{ folder, name: "Book", accent: "teal", logo: "book", pinned: pins.has(folder), recent: [{ path: draft, rank: 1, pinned: pins.has(draft) }] }]);
      ipcMain.removeHandler("projects:pin");
      ipcMain.handle("projects:pin", async (_event, project: string, path?: string) => {
        await new Promise(resolve => setTimeout(resolve, 1200));
        const key = path ?? project;
        if (pins.has(key)) pins.delete(key); else pins.add(key);
      });
    }, join(dirs.docs, "Synthetic Book"));
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+o" : "Control+Alt+o");
    const open = l.page.getByRole("dialog", { name: "Open", exact: true });
    await expect(open.getByRole("button", { name: "Pin Book", exact: true })).toBeAttached();
    // The confirmed outline holds for 200 ms, shorter than a poll can promise to see, so the renderer records each beat as it's drawn.
    await l.page.evaluate(() => {
      const beats: string[] = [];
      let last = "";
      Reflect.set(globalThis, "fnPinBeats", beats);
      new MutationObserver(() => {
        const now = [...document.querySelectorAll<HTMLElement>("[role=dialog] button[data-commit]")]
          .filter(el => /^(Un)?[Pp]in /.test(el.getAttribute("aria-label") ?? ""))
          .map(el => `${el.getAttribute("aria-label")}:${el.dataset.commit}`);
        for (const beat of now) if (!last.split("\n").includes(beat)) beats.push(beat);
        last = now.join("\n");
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-commit", "aria-label"] });
    });
    const beats = () => l.page.evaluate(() => (Reflect.get(globalThis, "fnPinBeats") as string[]).splice(0));
    for (const name of ["Book", "Draft"]) {
      for (const [from, to] of [["Pin", "Unpin"], ["Unpin", "Pin"]] as const) {
        await l.page.emulateMedia({ reducedMotion: from === "Unpin" ? "reduce" : "no-preference" });
        const before = open.getByRole("button", { name: `${from} ${name}`, exact: true });
        await before.click();
        await expect(before).toHaveAttribute("data-commit", "pending");
        await expect(before).toHaveAttribute("aria-busy", "true");
        const arc = before.locator('[data-border-progress="pending"]');
        await expect(arc).toHaveCount(1);
        await expect(before.locator("svg")).toHaveCount(1);
        await expect(before.locator("span:not([data-border-progress])")).toHaveCount(0);
        if (from === "Unpin") {
          await expect(arc).toHaveCSS("animation-name", "none");
          await expect(arc).toHaveCSS("border-top-style", "dashed");
        }
        await expect(before.locator("xpath=ancestor::span[@data-commit][1]")).toHaveCSS("opacity", "1");
        const after = open.getByRole("button", { name: `${to} ${name}`, exact: true });
        await expect(after).toHaveAttribute("data-commit", "rest");
        const seen = await beats();
        expect(seen.indexOf(`${from} ${name}:pending`)).toBeGreaterThanOrEqual(0);
        expect(seen.indexOf(`${to} ${name}:confirmed`)).toBeGreaterThan(seen.indexOf(`${from} ${name}:pending`));
        await expect(after).not.toHaveAttribute("aria-busy", "true");
      }
    }
    await expect(open.locator("[data-status-row=danger]")).toHaveCount(0);
  } finally { await closeTestApp(l); }
});

test("section loading uses the approved row shapes and keeps old content through a failed refresh and Retry", async () => {
  const dirs = tempDirs();
  const l = await launch(dirs);
  try {
    const outcomes = await sectionOutcomes(l);
    await l.app.evaluate(({ ipcMain }) => {
      let reads = 0;
      ipcMain.removeHandler("agents:load");
      ipcMain.handle("agents:load", async () => {
        const request = ++reads;
        await new Promise(resolve => setTimeout(resolve, 1100));
        if ([1, 2, 4, 5].includes(request)) throw new Error("section read refused");
        return {
          permissions: { connect: false, readPublic: true, readPrivate: false, edit: false, createPublic: true, folders: "all" },
          changedOutside: false, snippets: [], recent: [], cli: { available: false, installed: false, onPath: false },
        };
      });
    });
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    const shapes = settings.locator("[data-shimmer]");
    await expect(shapes).toHaveCount(6);
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationIterationCount)).toBe("3");
    await l.page.emulateMedia({ reducedMotion: "reduce" });
    expect(await shapes.first().evaluate(el => getComputedStyle(el, "::after").animationName)).toBe("none");
    await expect(shapes).toHaveCount(0);
    const error = settings.locator("[data-status-row=danger]");
    const failure = "Couldn't read agent settings. Try again.";
    await expect(error).toContainText(failure);
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(1);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.evaluate(el => Reflect.set(globalThis, "uiStatesRetainedAgentsError", el));
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(error.getByRole("button")).toHaveAttribute("aria-busy", "true");
    await expect(shapes).toHaveCount(0);
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(2);
    expect(await error.evaluate(el => el === Reflect.get(globalThis, "uiStatesRetainedAgentsError"))).toBe(true);
    expect(await outcomes()).not.toContain("Didn't finish");
    await error.getByRole("button", { name: "Retry", exact: true }).click();
    const retained = settings.getByText("Agents can use all folders.", { exact: true });
    await expect(retained).toBeVisible();
    await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
    await settings.getByRole("tab", { name: "Agents", exact: true }).click();
    await expect(retained).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect(settings.getByText("Couldn't read agent settings. Try again.", { exact: true })).toBeVisible();
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(3);
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(retained).toBeVisible();
    await expect(shapes).toHaveCount(0);
    await expect.poll(async () => (await outcomes()).filter(text => text === failure)).toHaveLength(4);
    expect(await outcomes()).not.toContain("Didn't finish");
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(settings.getByText("Couldn't read agent settings. Try again.", { exact: true })).toHaveCount(0);
  } finally { await closeTestApp(l); }
});

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

test("compact focus and docking controls retain stored values on failure and recover without changing the note", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  const text = "# A note\n\nKept text.\n\n## Another heading\n\nMore kept text.\n";
  writeFileSync(note, text);
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, focusMode: false }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const retry = l.page.getByRole("region", { name: "Notifications", exact: true }).getByRole("button", { name: "Retry", exact: true });
  try {
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    const toolbar = l.page.getByRole("toolbar", { name: "Toolbar", exact: true });
    const focus = toolbar.getByRole("button", { name: "Focus mode", exact: true });
    block();
    await focus.press("Space");
    await expect(focus).toHaveAttribute("data-commit", "failed");
    await expect(focus).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar).toBeVisible();
    restore();
    await retry.click();
    await expect.poll(() => saved().focusMode).toBe(true);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await expect(focus).toHaveAttribute("aria-pressed", "true");
    await l.page.keyboard.press("Escape");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+o" : "Control+o");
    const files = l.page.getByRole("complementary", { name: "Files", exact: true });
    const pin = files.getByRole("button", { name: "Dock Files", exact: true });
    block();
    await pin.click();
    await expect(pin).toHaveAttribute("data-commit", "failed");
    await expect(pin).toHaveAccessibleName("Dock Files");
    restore();
    await retry.click();
    await expect.poll(() => saved().filesPinned).toBe(true);
    await expect(files.getByRole("button", { name: "Undock Files", exact: true })).toBeVisible();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+." : "Control+.");
    await toolbar.getByRole("button", { name: "More", exact: true }).click();
    await l.page.getByRole("menuitemcheckbox", { name: "Dock contents", exact: true }).click();
    await expect.poll(() => saved().outlinePinned).toBe(true);
    const outline = l.page.locator("[data-doc-minimap-card]").getByRole("button", { name: "Unpin", exact: true });
    await expect(outline).toBeVisible();
    await expect(outline).not.toHaveAttribute("data-commit", "pending");
    block();
    await outline.click();
    await expect(outline).toHaveAttribute("data-commit", "failed");
    await expect(outline).not.toHaveAttribute("aria-pressed");
    await expect(outline).toBeVisible();
    restore();
    await retry.click();
    await expect.poll(() => saved().outlinePinned).toBeUndefined();
    expect(readFileSync(note, "utf8")).toBe(text);
  } finally { restore(); await closeTestApp(l); }
});

test("Reading size retains a failed value, retries exactly that value and leaves other reading choices alone", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Reading size\n\nKept text.\n");
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, fontSize: 16, paragraphSpacing: "airy" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const actualSize = () => l.page.locator("[data-editor]").evaluate((element) => getComputedStyle(element).fontSize);
  try {
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    };
    await open();
    const manager = l.page.getByRole("complementary", { name: "Theme", exact: true });
    await manager.getByRole("tab", { name: "Reading", exact: true }).click();
    const reading = manager.getByRole("tabpanel", { name: "Reading", exact: true });
    block();
    await reading.getByRole("button", { name: "Larger text", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
    await expect(reading.locator("[data-commit=failed]")).toHaveCount(1);
    await expect(reading.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    expect(await actualSize()).toBe("16px");
    restore();
    await reading.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().fontSize).toBe(17);
    await expect.poll(actualSize).toBe("17px");
    await expect(reading.getByRole("button", { name: "Smaller text", exact: true })).not.toHaveAttribute("aria-disabled", "true");
    block();
    await reading.getByRole("button", { name: "Smaller text", exact: true }).click();
    await expect(reading.getByText("16 px", { exact: true })).toBeVisible();
    await expect(reading.locator("[data-commit=failed]")).toHaveCount(1);
    restore();
    await reading.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
    expect(saved()).toMatchObject({ fontSize: 17, paragraphSpacing: "airy" });
    expect(await actualSize()).toBe("17px");
    await manager.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await manager.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(reading.getByText("17 px", { exact: true })).toBeVisible();
  } finally { restore(); await closeTestApp(l); }
});

test("theme and font choices keep failed drafts, retry their own choice and reopen stored settings", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Themes recovery\n");
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", projectIntroSeen: true, lastNotePath: note, appearance: "light" }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const block = () => { if (existsSync(stateFile)) renameSync(stateFile, backup); mkdirSync(stateFile); };
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  const saved = () => JSON.parse(readFileSync(stateFile, "utf8"));
  try {
    const open = async () => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
      const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
      await settings.getByRole("tab", { name: "Appearance", exact: true }).click();
      await settings.getByRole("button", { name: "Open theme manager", exact: true }).click();
    };
    await open();
    const theme = l.page.getByRole("complementary", { name: "Theme", exact: true });
    const gallery = theme.getByRole("listbox", { name: "Themes", exact: true });
    const paper = gallery.getByRole("option", { name: /^Paper/ });
    await paper.focus();
    await paper.press("ArrowRight");
    await expect.poll(() => saved().lightTheme).toBeUndefined();
    await expect.poll(() => saved().darkTheme).toBeUndefined();
    await l.page.keyboard.press("Escape");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    block();
    const dusk = gallery.getByRole("option", { name: /^Dusk/ });
    await dusk.click();
    await expect(theme.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(dusk).toHaveAttribute("aria-selected", "true");
    await expect(dusk.locator("[data-border-progress=failed]")).toHaveCount(1);
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "paper");
    await dusk.press("Home");
    await expect(gallery.getByRole("option", { name: /^Paper/ })).toHaveAttribute("aria-selected", "true");
    restore();
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().darkTheme).toBe("dusk");
    await expect.poll(() => saved().appearance).toBe("dark");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "dusk");
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    const font = theme.getByRole("button", { name: /^Font:/ });
    await font.click();
    block();
    await l.page.getByRole("menuitemcheckbox", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(font).toHaveAttribute("data-commit", "failed");
    await expect(font).toContainText("Serif (Fraunces and Newsreader)");
    await expect(l.page.locator("html")).not.toHaveAttribute("data-content-font");
    restore();
    await theme.getByRole("tabpanel", { name: "Reading", exact: true }).getByRole("button", { name: "Revert", exact: true }).click();
    await expect(font).toContainText("Mono");
    await expect.poll(() => saved().contentFont).toBeUndefined();
    await font.click();
    block();
    await l.page.getByRole("menuitemcheckbox", { name: "Serif (Fraunces and Newsreader)", exact: true }).click();
    await expect(font).toHaveAttribute("data-commit", "failed");
    restore();
    await theme.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => saved().contentFont).toBe("serif");
    await expect(l.page.locator("html")).toHaveAttribute("data-content-font", "serif");
    await expect(font).not.toHaveAttribute("data-commit", "pending");
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(font).toContainText("Serif (Fraunces and Newsreader)");
    await expect(l.page.locator("html")).toHaveAttribute("data-theme", "dusk");
  } finally { restore(); await closeTestApp(l); }
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
    await expect(dim.locator("xpath=ancestor::*[@data-commit][1]")).not.toHaveAttribute("data-commit", "pending");
    await dim.focus();
    await dim.press("ArrowLeft");
    await theme.getByRole("tab", { name: "Themes", exact: true }).click();
    await expect(dim).toHaveCount(0);
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).focusDim).toBe(0.55);
    await theme.getByRole("tab", { name: "Reading", exact: true }).click();
    await expect(dim).toHaveValue("0.55");
    await theme.getByRole("button", { name: "Close", exact: true }).click();
    await open();
    await expect(width).toHaveValue("85");
    await expect(line).toHaveValue("2");
    await expect(dim).toHaveValue("0.55");
  } finally { restore(); await closeTestApp(l); }
});

test("SVG logo upload keeps its source on failure, retries without a picker and preserves the saved mark on Revert", async () => {
  const dirs = tempDirs();
  const stateFile = join(dirs.userData, DATA_FILES.state);
  const logoFile = join(dirs.docs, "review-logo.svg");
  writeFileSync(logoFile, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8"/></svg>');
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    await l.app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, logoFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    const settings = l.page.getByRole("dialog", { name: "Settings", exact: true });
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    const upload = settings.getByRole("button", { name: "Upload SVG…", exact: true });
    if (existsSync(stateFile)) renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await upload.click();
    await expect(settings.getByText("Couldn't save this logo. Your choice is kept here; the saved logo is unchanged. Try again or revert.", { exact: true })).toBeVisible();
    await expect(settings.locator('img[src^="data:image/svg+xml"]')).toBeVisible();
    restore();
    await l.app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => { throw new Error("Retry must not reopen the picker"); };
    });
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    const saved = () => Object.values(JSON.parse(readFileSync(stateFile, "utf8")).projectSettings ?? {})[0] as { logo: string; logoSrc: string } | undefined;
    await expect.poll(() => saved()?.logo).toBe("upload");
    expect(saved()?.logoSrc).toMatch(/^data:image\/svg\+xml/);
    await settings.getByRole("button", { name: "Rocket", exact: true }).click();
    await expect.poll(() => saved()?.logo).toBe("rocket");
    await settings.getByRole("button", { name: "Close", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+," : "Control+,");
    await settings.getByRole("tab", { name: "Project", exact: true }).click();
    await l.app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, logoFile);
    renameSync(stateFile, backup);
    mkdirSync(stateFile);
    await upload.click();
    await expect(settings.getByRole("button", { name: "Revert", exact: true })).toBeVisible();
    restore();
    await settings.getByRole("button", { name: "Revert", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Rocket", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(saved()?.logo).toBe("rocket");
  } finally { restore(); await closeTestApp(l); }
});

test("four writing outcomes queue, reveal the next pill and retain a failed Retry without losing editor focus", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Notifications\n\nalpha alpha beta\n");
  const stateFile = join(dirs.userData, DATA_FILES.state);
  writeFileSync(stateFile, JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note, fontSize: 16 }));
  const l = await launch(dirs);
  const backup = `${stateFile}.before-failure`;
  const restore = () => {
    if (existsSync(stateFile) && statSync(stateFile).isDirectory()) rmSync(stateFile, { recursive: true });
    if (existsSync(backup)) renameSync(backup, stateFile);
  };
  try {
    const region = l.page.getByRole("region", { name: "Notifications", exact: true });
    while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) {
      await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    }
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await editor.click();
    renameSync(stateFile, backup); mkdirSync(stateFile);
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+=" : "Control+=");
    const retry = region.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeVisible();
    await expect(editor).toBeFocused();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
    const replaceAll = async (find: string, replace: string, count: number) => {
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Alt+f" : "Control+h");
      const bar = l.page.getByRole("region", { name: "Find in note", exact: true });
      await bar.getByRole("searchbox", { name: "Find", exact: true }).fill(find);
      await expect(bar.getByRole("status").first()).toHaveText(new RegExp(`of ${count}$`));
      await bar.getByRole("searchbox", { name: "Replace with", exact: true }).fill(replace);
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Alt+Enter");
      await expect(editor).toContainText(replace);
      await l.page.keyboard.press("Escape");
      await expect(editor).toBeFocused();
    };
    await replaceAll("alpha", "gamma", 2);
    await replaceAll("beta", "delta", 1);
    await expect(region.locator("[data-surface=toast]")).toHaveCount(3);
    await expect(region).toContainText("1 more waiting");
    await expect(region.locator("[data-surface=toast]").first()).toHaveAttribute("data-tone", "error");
    await expect(region.locator("[data-surface=toast][data-tone=success]")).toHaveCount(1);
    await region.locator("[data-surface=toast][data-tone=warning]").getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(region.locator("[data-surface=toast][data-tone=success]")).toHaveCount(2);
    await expect(region).not.toContainText("1 more waiting");
    await expect(editor).toBeFocused();
    await l.page.keyboard.press("F6");
    await expect(retry).toBeFocused();
    await retry.click();
    await expect(retry).not.toHaveAttribute("aria-disabled", "true");
    await expect(region.locator("[data-surface=toast][data-tone=error]")).toHaveCount(1);
    await expect(retry).toBeVisible();
    restore();
    await retry.click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).fontSize).toBe(17);
    await expect(region.locator("[data-surface=toast][data-tone=error]")).toHaveCount(0);
    await expect(editor).toBeFocused();
    await expect(editor).toContainText("gamma gamma delta");
  } finally { restore(); await closeTestApp(l); }
});

test("a failed note save stays must-read until Retry stores the retained edits", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  const original = "# Must read\n\nOriginal fixture text.\n";
  writeFileSync(note, original);
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  const backup = `${note}.before-failure`;
  const restore = () => {
    if (existsSync(note) && statSync(note).isDirectory()) rmSync(note, { recursive: true });
    if (existsSync(backup)) renameSync(backup, note);
  };
  try {
    const region = l.page.getByRole("region", { name: "Notifications", exact: true });
    while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(editor).toContainText("Original fixture text.");
    renameSync(note, backup);
    mkdirSync(note);
    await editor.click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End");
    await l.page.keyboard.type(" Retained edits.");
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
    const notice = region.locator("[data-surface=toast][data-tone=error]");
    await expect(notice).toHaveAttribute("data-sticky", "");
    expect(readFileSync(backup, "utf8")).toBe(original);
    await expect(editor).toContainText("Retained edits.");
    await l.page.mouse.move(0, 0);
    await l.page.waitForTimeout(9000);
    await expect(notice).toBeVisible();
    await expect(editor).toBeFocused();
    restore();
    await notice.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => readFileSync(note, "utf8")).toContain("Retained edits.");
    await expect(notice).toHaveCount(0);
    await expect(editor).toContainText("Original fixture text.");
  } finally { restore(); await closeTestApp(l); }
});

test("an actually wrapped writing notice stays for eight visible seconds", async () => {
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, "# Wrapped notice\n\nKept text.\n");
  writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
  const l = await launch(dirs);
  try {
    const region = l.page.getByRole("region", { name: "Notifications", exact: true });
    while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
    await l.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(360, 640);
      window.setContentSize(360, 640);
    });
    await expect.poll(() => l.page.evaluate(() => innerWidth)).toBe(360);
    await l.page.mouse.move(0, 0);
    await l.page.getByRole("textbox", { name: "Note", exact: true }).click();
    await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
    const notice = region.locator("[data-surface=toast][data-tone=warning]");
    await expect(notice).toBeVisible();
    const lines = await notice.locator("span[dir=auto]").evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => rect.top)).size;
    });
    expect(lines).toBeGreaterThan(1);
    await l.page.waitForTimeout(6000);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(0, { timeout: 3000 });
  } finally { await closeTestApp(l); }
});

for (const endsFirst of ["hover", "focus"] as const) {
  test(`notification lifetime stays paused when ${endsFirst} ends while the other cause remains`, async () => {
    const dirs = tempDirs();
    const note = join(dirs.docs, "Welcome.md");
    const original = "# Pause causes\n\nKept text.\n";
    writeFileSync(note, original);
    writeFileSync(join(dirs.userData, DATA_FILES.state), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
    const l = await launch(dirs);
    try {
      const region = l.page.getByRole("region", { name: "Notifications", exact: true });
      while (await region.getByRole("button", { name: "Dismiss", exact: true }).count()) await region.getByRole("button", { name: "Dismiss", exact: true }).first().click();
      const editor = l.page.getByRole("textbox", { name: "Note", exact: true });
      await editor.click();
      await l.page.keyboard.press(process.platform === "darwin" ? "Meta+u" : "Control+u");
      const notice = region.locator("[data-surface=toast][data-tone=warning]");
      await expect(notice).toBeVisible();
      await l.page.waitForTimeout(1000);
      await notice.hover();
      await l.page.keyboard.press("F6");
      await expect(notice.getByRole("button", { name: "Dismiss", exact: true })).toBeFocused();
      if (endsFirst === "hover") await editor.hover();
      else await editor.focus();
      await l.page.waitForTimeout(8000);
      await expect(notice).toBeVisible();
      if (endsFirst === "hover") await editor.focus();
      else await editor.hover();
      await l.page.waitForTimeout(3500);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveCount(0, { timeout: 2500 });
      expect(readFileSync(note, "utf8")).toBe(original);
    } finally { await closeTestApp(l); }
  });
}

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

test("a refused watermark Switch keeps the writing surface unchanged and Retry preserves its last saved value", async () => {
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
    const watermark = settings.getByRole("switch", { name: "Watermark", exact: true });
    const mark = l.page.locator('[data-project-mark="watermark"]');
    await expect(mark).toHaveCount(0);
    block();
    await watermark.press("Space");
    await expect(watermark).not.toBeChecked();
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(0);
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.watermark).toBe("on");
    await expect(mark).toHaveCount(1);
    await expect(watermark.locator("xpath=ancestor::label")).not.toHaveAttribute("data-commit", "pending");
    block();
    await watermark.press("Space");
    await expect(settings.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
    await expect(mark).toHaveCount(1);
    await expect(watermark).toBeChecked();
    await expect(mark).toHaveCount(1);
    expect(statSync(stateFile).isDirectory()).toBe(true);
    restore();
    await settings.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => JSON.parse(readFileSync(stateFile, "utf8")).projectSettings?.[dirs.docs]?.watermark).toBe("off");
    await expect(mark).toHaveCount(0);
  } finally {
    restore();
    await closeTestApp(l);
  }
});
