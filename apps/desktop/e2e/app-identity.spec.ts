import { test, expect, _electron as electron } from "./fixtures.ts";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { launch, quit, tempDirs, type Launched } from "./helpers.ts";
import { journeyUnseen } from "../src/main/window/journey-window.ts";

async function closeInstances(launched: Launched[], root: string): Promise<void> {
  try {
    await Promise.all(launched.map(quit));
  } finally {
    if (process.platform === "win32") {
      // Include this runner's descendants too if Electron failed before launch() returned its PID.
      const only = [...launched.map(instance => instance.pid), process.pid].join(",");
      const cleanup = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
      execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", only, "-WhatIf"], { stdio: "inherit" });
      execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", only], { stdio: "inherit" });
    }
    rmSync(root, { recursive: true, force: true });
  }
}

test("Repeated no-path launches open distinct Open windows in the same Preview process, preserving the note (PRJ-25, D-377)", async () => {
  test.skip(Boolean(process.env.FOCUS_NOTES_E2E_EXE), "Packaged apps intentionally ignore the invisible journey seam.");
  const dirs = tempDirs();
  const instance = await launch(dirs, { FOCUS_NOTES_CHANNEL: "preview" });
  try {
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeVisible();
    expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
    await note.press("End");
    await note.pressSequentially(" Kept in the primary window");
    const selection = await note.evaluate(() => {
      const s = getSelection();
      return { offset: s?.anchorOffset, text: s?.anchorNode?.textContent };
    });
    await expect.poll(() => instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true);
    const before = await note.textContent();
    const repeated = await instance.app.evaluate(({ app, BrowserWindow }) => {
      Reflect.set(globalThis, "repeatedPreviewLaunches", 0);
      app.on("second-instance", () => {
        Reflect.set(globalThis, "repeatedPreviewLaunches", Number(Reflect.get(globalThis, "repeatedPreviewLaunches")) + 1);
      });
      return {
        executable: process.execPath,
        env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      };
    });
    const relaunch = () => promisify(execFile)(repeated.executable,
      [join(import.meta.dirname, "..", "out", "main", "main.mjs")],
      { env: repeated.env, timeout: 5000 });
    for (let i = 0; i < 2; i++) {
      const window = instance.app.waitForEvent("window");
      await relaunch();
      const page = await window;
      expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
      const open = page.getByRole("dialog", { name: "Open", exact: true });
      await expect(open).toBeVisible();
      await expect(open.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
      await open.getByRole("button", { name: "Close", exact: true }).click();
      await expect(open).toBeHidden();
      await page.keyboard.press("Control+Alt+O");
      await expect(open).toBeVisible();
    }
    await Promise.all([relaunch(), relaunch()]);
    await expect.poll(() => instance.app.windows().length).toBe(5);
    expect(await instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(w => w.getOpacity() === 0))).toBe(true);
    const primaryUrl = instance.page.url();
    for (const page of instance.app.windows()) {
      if (page === instance.page) continue;
      expect(new URL(page.url()).searchParams.get("open")).toBe("1");
      await expect(page.getByRole("dialog", { name: "Open", exact: true })).toBeVisible();
    }
    expect(new URL(primaryUrl).searchParams.has("open")).toBe(false);
    await expect.poll(() => instance.app.evaluate(({ app, BrowserWindow }) => ({
      launches: Reflect.get(globalThis, "repeatedPreviewLaunches"),
      windows: BrowserWindow.getAllWindows().length,
      lock: app.hasSingleInstanceLock(),
      recovered: BrowserWindow.getAllWindows()[0]?.isVisible(),
      opacity: BrowserWindow.getAllWindows()[0]?.getOpacity(),
    }))).toEqual({ launches: 4, windows: 5, lock: true, recovered: true, opacity: 0 });
    expect(await note.textContent()).toBe(before);
    expect(await note.evaluate(() => {
      const s = getSelection();
      return { offset: s?.anchorOffset, text: s?.anchorNode?.textContent };
    })).toEqual(selection);
    expect(JSON.parse(readFileSync(join(dirs.userData, "state.json"), "utf8")).lastNotePath).toBe(join(dirs.docs, "Welcome.md"));
    const target = join(dirs.docs, "Explicit-target.md");
    writeFileSync(target, "# Explicit target\n\nExisting file route still works.\n");
    await instance.app.evaluate(({ app }, path) => app.emit("second-instance", {}, [process.execPath, "--project-note", path], ""), target);
    await expect.poll(() => instance.app.evaluate(() => Reflect.get(globalThis, "repeatedPreviewLaunches"))).toBe(5);
    await expect(note).toContainText("Existing file route still works.");
    expect(instance.app.windows()).toHaveLength(5);
    expect(readFileSync(join(dirs.docs, "Welcome.md"), "utf8")).toContain("Kept in the primary window");
  } finally {
    await closeInstances([instance], dirs.userData);
    rmSync(dirs.docs, { recursive: true, force: true });
  }
});

test("Preview and the stable channel keep their native locks and writing windows side by side", async () => {
  test.skip(Boolean(process.env.FOCUS_NOTES_E2E_EXE), "Uses a source-only entrypoint to isolate the synthetic default profile.");
  const root = mkdtempSync(join(tmpdir(), "fn-channel-native-"));
  const legacy = join(root, "Focus Notes");
  const previewProfile = `${legacy} Preview`;
  const launched: Launched[] = [];
  try {
    for (const channel of ["stable", "preview"]) {
      const docs = join(root, "notes");
      mkdirSync(legacy, { recursive: true });
      mkdirSync(docs, { recursive: true });
      const instance = await launch({ userData: legacy, docs }, {
        FOCUS_NOTES_CHANNEL: channel, FOCUS_NOTES_USER_DATA: "",
        FOCUS_NOTES_PROJECTS_PROFILE: "", FOCUS_NOTES_PROJECT_NOTE: "",
        FOCUS_NOTES_TEST_LEGACY_PROFILE: legacy,
      }, { entrypoint: join(import.meta.dirname, "channel-entry.mjs") });
      launched.push(instance);
      console.log(`channel-native pid=${instance.pid}`);
      await expect(instance.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    }
    const identities = await Promise.all(launched.map(({ app }) => app.evaluate(({ app, BrowserWindow }) => ({
      name: app.getName(), profile: app.getPath("userData"), ownsLock: app.hasSingleInstanceLock(),
      invisible: BrowserWindow.getAllWindows().every(window => window.getOpacity() === 0),
    }))));
    expect(identities).toEqual([
      { name: identities[0]!.name, profile: legacy, ownsLock: true, invisible: journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) },
      { name: "Focus Notes Preview", profile: previewProfile, ownsLock: true, invisible: journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) },
    ]);
    expect(identities[0]!.name).not.toBe(identities[1]!.name);
    for (const profile of [legacy, previewProfile]) expect(existsSync(join(profile, "project-metadata.sqlite"))).toBe(true);
    const previewEnv = await launched[1]!.app.evaluate(() => Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ));
    await expect(electron.launch({
      args: [join(import.meta.dirname, "channel-entry.mjs")],
      env: previewEnv, timeout: 5000,
    })).rejects.toThrow();
    for (const { page } of launched) await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
  } finally {
    await closeInstances(launched, root);
  }
});

test("Preview still opens after a carry-over failure and shows its must-read retry notice", async () => {
  test.skip(Boolean(process.env.FOCUS_NOTES_E2E_EXE), "Uses a source-only entrypoint to isolate the synthetic default profile.");
  const root = mkdtempSync(join(tmpdir(), "fn-channel-native-"));
  const legacy = join(root, "Focus Notes");
  const launched: Launched[] = [];
  try {
    const docs = join(root, "notes");
    mkdirSync(legacy);
    mkdirSync(docs);
    writeFileSync(join(legacy, "last-project.json"), "injected malformed pointer");
    const instance = await launch({ userData: legacy, docs }, {
      FOCUS_NOTES_CHANNEL: "preview", FOCUS_NOTES_USER_DATA: "",
      FOCUS_NOTES_TEST_LEGACY_PROFILE: legacy,
    }, { entrypoint: join(import.meta.dirname, "channel-entry.mjs") });
    launched.push(instance);
    console.log(`channel-native pid=${instance.pid}`);
    await expect(instance.page.getByText("Couldn't bring over your Preview settings. Focus Notes will try again next time.", { exact: true })).toBeVisible();
    expect(await instance.app.evaluate(({ app }) => ({ lock: app.hasSingleInstanceLock(), profile: app.getPath("userData") }))).toEqual({
      lock: true, profile: `${legacy} Preview`,
    });
    expect(existsSync(join(`${legacy} Preview`, "preview-carry-over.json"))).toBe(false);
  } finally {
    await closeInstances(launched, root);
  }
});
