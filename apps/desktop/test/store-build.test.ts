/**
 * The Microsoft Store build (PKG-12, D-202): which process is a command. The launchers and the
 * connection snippets put `--cli` first; the package's `focus-notes` alias passes what was typed, so
 * there a first argument that isn't a switch is a command too. A deep link is never a command, and
 * Chromium's own switches (a relaunch, a second instance) never start one.
 */
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { cliArgv, isStoreBuild, storeAliasPath } from "../src/main/store-build.ts";

const exe = "C:\\Program Files\\WindowsApps\\Placeholder.FocusNotes_0.0.1.0_x64__abc\\app\\focus-notes.exe";
const packaged = { packaged: true, store: false };
const store = { packaged: true, store: true };

describe("cliArgv", () => {
  it("keeps the --cli rule everywhere: the very first argument, packaged or not", () => {
    expect(cliArgv([exe, "--cli", "ls", "notes"], packaged)).toEqual(["ls", "notes"]);
    expect(cliArgv([exe, "--cli", "mcp", "--data", "D"], store)).toEqual(["mcp", "--data", "D"]);
    expect(cliArgv(["electron.exe", "main.mjs", "--cli", "help"], { packaged: false, store: false })).toEqual(["help"]);
    expect(cliArgv([exe, "--foo", "--cli", "ls"], packaged)).toBeUndefined();
    expect(cliArgv([exe], packaged)).toBeUndefined();
  });

  it("runs what the Store's alias passes as typed, and only in the Store's package", () => {
    expect(cliArgv([exe, "ls", "notes"], store)).toEqual(["ls", "notes"]);
    expect(cliArgv([exe, "help"], store)).toEqual(["help"]);
    expect(cliArgv([exe, "ls"], packaged)).toBeUndefined();
    expect(cliArgv(["electron.exe", "main.mjs", "ls"], { packaged: false, store: true })).toBeUndefined();
  });

  it("starts the app, never a command, for a deep link, Chromium's switches or no arguments", () => {
    expect(cliArgv([exe, "focus-notes://open?path=a.md"], store)).toBeUndefined();
    expect(cliArgv([exe, "--cli", "ls", "FOCUS-NOTES://x"], store)).toBeUndefined();
    expect(cliArgv([exe, "--allow-file-access-from-files"], store)).toBeUndefined();
    expect(cliArgv([exe], store)).toBeUndefined();
  });
});

describe("isStoreBuild and the alias", () => {
  it("follows Electron's process.windowsStore only when it's exactly true", () => {
    expect(isStoreBuild({ windowsStore: true })).toBe(true);
    expect(isStoreBuild({})).toBe(false);
    expect(isStoreBuild({ windowsStore: false })).toBe(false);
  });

  it("names the alias where Windows keeps it for every version", () => {
    expect(storeAliasPath("C:\\Users\\me\\AppData\\Local")).toBe(join("C:\\Users\\me\\AppData\\Local", "Microsoft", "WindowsApps", "focus-notes.exe"));
  });
});
