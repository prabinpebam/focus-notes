import { test, expect, _electron as electron } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("A repeated Preview launch recovers its existing writing window without another instance (PKG-03, D-366)", async () => {
  test.skip(Boolean(process.env.FOCUS_NOTES_E2E_EXE), "Packaged apps intentionally ignore the invisible journey seam.");
  const dirs = tempDirs();
  const instance = await launch(dirs, { FOCUS_NOTES_CHANNEL: "preview" });
  try {
    const note = instance.page.getByRole("textbox", { name: "Note", exact: true });
    await expect(note).toBeVisible();
    await expect.poll(() => instance.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())).toBe(true);
    const before = await note.textContent();
    const repeated = await instance.app.evaluate(({ app, BrowserWindow }) => {
      Reflect.set(globalThis, "repeatedPreviewLaunches", 0);
      app.on("second-instance", () => Reflect.set(globalThis, "repeatedPreviewLaunches",
        Number(Reflect.get(globalThis, "repeatedPreviewLaunches")) + 1));
      BrowserWindow.getAllWindows()[0]!.hide();
      return {
        executable: process.execPath,
        env: Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      };
    });
    await expect(electron.launch({
      executablePath: repeated.executable,
      args: [join(import.meta.dirname, "..", "out", "main", "main.mjs")],
      env: repeated.env, timeout: 5000,
    })).rejects.toThrow();
    await expect.poll(() => instance.app.evaluate(({ app, BrowserWindow }) => ({
      launches: Reflect.get(globalThis, "repeatedPreviewLaunches"),
      windows: BrowserWindow.getAllWindows().length,
      lock: app.hasSingleInstanceLock(),
      recovered: BrowserWindow.getAllWindows()[0]?.isVisible(),
      opacity: BrowserWindow.getAllWindows()[0]?.getOpacity(),
    }))).toEqual({ launches: 1, windows: 1, lock: true, recovered: true, opacity: journeyUnseen({ ...process.env, FOCUS_NOTES_E2E: "1" }) ? 0 : 1 });
    expect(await note.textContent()).toBe(before);
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
