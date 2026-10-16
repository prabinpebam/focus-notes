/**
 * Install command-line tool (WP-7.4, D-165 (2), D-166 (5)): the folder joins the user's own Path
 * once, compared as Windows does; the PowerShell gets the folder only through its environment; on
 * macOS and Linux only our own link is ever made, and nothing else at ~/.local/bin/focus-notes is
 * replaced. Nothing here changes this computer's PATH: PowerShell is a fake.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WINDOWS_INSTALL_SCRIPT, cliInstallState, installCli, pathWithFolder, type InstallHost } from "../src/main/agents/install-cli.ts";

const BIN = "C:\\Program Files\\Focus Notes\\resources\\bin";

describe("Install command-line tool", () => {
  it("adds the folder to a Path once, without case or a trailing slash mattering on Windows", () => {
    expect(pathWithFolder("C:\\a;C:\\b", BIN, true)).toBe(`C:\\a;C:\\b;${BIN}`);
    expect(pathWithFolder(`C:\\a;${BIN.toUpperCase()}\\`, BIN, true)).toBeUndefined();
    expect(pathWithFolder("", BIN, true)).toBe(BIN);
    expect(pathWithFolder(";;C:\\a;", BIN, true)).toBe(`C:\\a;${BIN}`);
    expect(pathWithFolder("/usr/bin:/home/me/.local/bin", "/home/me/.local/bin", false)).toBeUndefined();
    expect(pathWithFolder("/usr/bin", "/HOME/me/.local/bin", false)).toBe("/usr/bin:/HOME/me/.local/bin");
  });

  it("on Windows, runs a fixed script and passes the folder only in the environment", async () => {
    let path = "C:\\a";
    const calls: { script: string; env: Record<string, string> }[] = [];
    const h: InstallHost = {
      platform: "win32", binDir: BIN, home: "C:\\Users\\me", envPath: "",
      powershell: async (script, env) => { calls.push({ script, env }); path = pathWithFolder(path, env.FOCUS_NOTES_BIN!, true) ?? path; return 0; },
      userPath: async () => path,
    };
    expect(await cliInstallState(h)).toEqual({ installed: false, onPath: false });
    expect(await installCli(h)).toEqual({ installed: true, onPath: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.script).toBe(WINDOWS_INSTALL_SCRIPT);
    expect(calls[0]!.script).not.toContain("Program Files");
    expect(calls[0]!.script).toContain("'User'");
    expect(calls[0]!.env).toEqual({ FOCUS_NOTES_BIN: BIN });
    const failing: InstallHost = { ...h, powershell: async () => 1 };
    await expect(installCli(failing)).rejects.toThrow();
  });

  it("on macOS and Linux, never replaces something else at ~/.local/bin/focus-notes", async () => {
    const home = mkdtempSync(join(tmpdir(), "fn-home-"));
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(join(home, ".local", "bin", "focus-notes"), "#!/bin/sh\necho mine\n");
    const h: InstallHost = { platform: "linux", binDir: "/opt/Focus Notes/resources/bin", home, envPath: "/usr/bin", powershell: async () => 1, userPath: async () => "" };
    await expect(installCli(h)).rejects.toThrow(/Something else/);
    expect(readFileSync(join(home, ".local", "bin", "focus-notes"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(await cliInstallState(h)).toEqual({ installed: false, onPath: false });
  });
});
