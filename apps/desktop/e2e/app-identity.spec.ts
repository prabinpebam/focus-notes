import { test, expect, _electron as electron } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, quit, type Launched } from "./helpers.ts";

test("Preview and the stable channel keep their native locks and writing windows side by side", async () => {
  test.skip(Boolean(process.env.FOCUS_NOTES_E2E_EXE), "Uses a source-only entrypoint to isolate the synthetic default profile.");
  const root = mkdtempSync(join(tmpdir(), "fn-channel-native-"));
  const legacy = join(root, "Focus Notes");
  const previewProfile = `${legacy} Preview`;
  const launched: Launched[] = [];
  const pids: number[] = [];
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
      pids.push(instance.pid);
      console.log(`channel-native pid=${instance.pid}`);
      await expect(instance.page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
    }
    const identities = await Promise.all(launched.map(({ app }) => app.evaluate(({ app, BrowserWindow }) => ({
      name: app.getName(), profile: app.getPath("userData"), ownsLock: app.hasSingleInstanceLock(),
      invisible: BrowserWindow.getAllWindows().every(window => window.getOpacity() === 0),
    }))));
    expect(identities).toEqual([
      { name: identities[0]!.name, profile: legacy, ownsLock: true, invisible: true },
      { name: "Focus Notes Preview", profile: previewProfile, ownsLock: true, invisible: true },
    ]);
    expect(identities[0]!.name).not.toBe(identities[1]!.name);
    const previewEnv = await launched[1]!.app.evaluate(() => Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ));
    await expect(electron.launch({
      args: [join(import.meta.dirname, "channel-entry.mjs")],
      env: previewEnv, timeout: 5000,
    })).rejects.toThrow();
    for (const { page } of launched) await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
  } finally {
    try {
      await Promise.all(launched.map(quit));
    } finally {
      if (process.platform === "win32") {
        // Include this runner's descendants too if Electron failed before launch() returned its PID.
        const only = [...pids, process.pid].join(",");
        const cleanup = join(import.meta.dirname, "..", "..", "..", "tools", "dev", "close-test-apps.ps1");
        execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", only, "-WhatIf"], { stdio: "inherit" });
        execFileSync("pwsh", ["-NoProfile", "-File", cleanup, "-OnlyPid", only], { stdio: "inherit" });
      }
      rmSync(root, { recursive: true, force: true });
    }
  }
});
