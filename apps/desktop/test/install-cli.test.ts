/**
 * Install command-line tool (WP-7.4, D-165 (2), D-166 (5), and the security review of ba5dcb9):
 * the folder joins the user's own Path once; the raw value keeps its %VAR% names and its kind
 * (REG_EXPAND_SZ stays expandable); a write that didn't take is an error, never silent success; a
 * Path changed in between isn't overwritten; a folder with ';' is refused; the scripts are fixed text
 * with every value in their environment; on macOS and Linux nothing else at ~/.local/bin/focus-notes
 * is replaced. The registry is a fake: no test touches this computer's registry or PATH.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WINDOWS_READ_SCRIPT, WINDOWS_WRITE_SCRIPT, cliInstallState, installCli, pathWithFolder, readUserPath, type InstallHost, type PathKind } from "../src/main/agents/install-cli.ts";

const BIN = "C:\\Program Files\\Focus Notes\\resources\\bin";
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string) => Buffer.from(s, "base64").toString("utf8");

/** A fake HKCU\Environment\Path behind the two scripts, as the real ones read and write it. */
function registry(start: { kind: PathKind | "DWord"; value: string }, o: { writeTakes?: boolean; changeBeforeWrite?: string } = {}) {
  const reg = { ...start };
  const runs: { script: "read" | "write"; env: Record<string, string> }[] = [];
  const host: InstallHost = {
    platform: "win32", binDir: BIN, home: "C:\\Users\\me", envPath: "",
    powershell: async (script, env) => {
      if (script === WINDOWS_READ_SCRIPT) {
        runs.push({ script: "read", env });
        return { code: 0, stdout: `${reg.kind}:${b64(reg.kind === "None" ? "" : reg.value)}` };
      }
      if (script === WINDOWS_WRITE_SCRIPT) {
        runs.push({ script: "write", env });
        if (o.changeBeforeWrite !== undefined) reg.value = o.changeBeforeWrite;
        if ((reg.kind === "None" ? "" : reg.value) !== unb64(env.FOCUS_NOTES_PATH_OLD!)) return { code: 4, stdout: "" };
        // The bug the review found: a script that exits 0 without writing.
        if (o.writeTakes !== false) Object.assign(reg, { value: unb64(env.FOCUS_NOTES_PATH_VALUE!), kind: env.FOCUS_NOTES_PATH_KIND as PathKind });
        return { code: 0, stdout: "" };
      }
      throw new Error("not one of the fixed scripts");
    },
  };
  return { reg, runs, host };
}

describe("Install command-line tool on Windows", () => {
  it("adds the folder once, without case or a trailing slash mattering", () => {
    expect(pathWithFolder("C:\\a;C:\\b", BIN, true)).toBe(`C:\\a;C:\\b;${BIN}`);
    expect(pathWithFolder(`C:\\a;${BIN.toUpperCase()}\\`, BIN, true)).toBeUndefined();
    expect(pathWithFolder(";;C:\\a;", BIN, true)).toBe(`C:\\a;${BIN}`);
  });

  it("keeps %VAR% names and the expandable kind, and passes values only in the environment", async () => {
    const f = registry({ kind: "ExpandString", value: "%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Tools" });
    expect(await installCli(f.host)).toEqual({ installed: true, onPath: true });
    expect(f.reg).toEqual({ kind: "ExpandString", value: `%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;C:\\Tools;${BIN}` });
    const write = f.runs.find((r) => r.script === "write")!;
    expect(write.env.FOCUS_NOTES_PATH_KIND).toBe("ExpandString");
    for (const script of [WINDOWS_READ_SCRIPT, WINDOWS_WRITE_SCRIPT]) {
      expect(script).not.toContain("Program Files");
      expect(script).toMatch(/DoNotExpandEnvironmentNames/);
      expect(script.endsWith("\r\n")).toBe(true);
    }
    expect(WINDOWS_WRITE_SCRIPT).toMatch(/SendMessageTimeout\(\[IntPtr\]0xffff, 0x1A/);
  });

  it("keeps a plain string Path plain, and makes a missing one expandable", async () => {
    const plain = registry({ kind: "String", value: "C:\\a" });
    await installCli(plain.host);
    expect(plain.reg).toEqual({ kind: "String", value: `C:\\a;${BIN}` });
    const none = registry({ kind: "None", value: "" });
    await installCli(none.host);
    expect(none.reg).toEqual({ kind: "ExpandString", value: BIN });
  });

  it("round-trips names outside ASCII", async () => {
    const f = registry({ kind: "ExpandString", value: "C:\\Users\\Prabin Pébam\\bin;D:\\工具" });
    expect((await readUserPath(f.host)).value).toBe("C:\\Users\\Prabin Pébam\\bin;D:\\工具");
    await installCli(f.host);
    expect(f.reg.value).toBe(`C:\\Users\\Prabin Pébam\\bin;D:\\工具;${BIN}`);
  });

  it("is an error, never a silent success, when the write didn't take or the Path changed in between", async () => {
    await expect(installCli(registry({ kind: "ExpandString", value: "C:\\a" }, { writeTakes: false }).host)).rejects.toThrow(/didn't change/);
    const raced = registry({ kind: "ExpandString", value: "C:\\a" }, { changeBeforeWrite: "C:\\a;C:\\new" });
    await expect(installCli(raced.host)).rejects.toThrow(/changed while installing/);
    expect(raced.reg.value).toBe("C:\\a;C:\\new");
  });

  it("does nothing when it's there already, and refuses a folder with ';' or a Path that isn't a string", async () => {
    const there = registry({ kind: "ExpandString", value: `C:\\a;${BIN}` });
    expect(await installCli(there.host)).toEqual({ installed: true, onPath: true });
    expect(there.runs.some((r) => r.script === "write")).toBe(false);
    const semi = registry({ kind: "ExpandString", value: "C:\\a" });
    await expect(installCli({ ...semi.host, binDir: "C:\\Odd;Folder\\bin" })).rejects.toThrow();
    expect(semi.runs).toEqual([]);
    const dword = registry({ kind: "DWord", value: "1" });
    await expect(installCli(dword.host)).rejects.toThrow(/DWord/);
    expect(dword.runs.some((r) => r.script === "write")).toBe(false);
    expect(await cliInstallState(registry({ kind: "ExpandString", value: "C:\\a" }).host)).toEqual({ installed: false, onPath: false });
  });
});

describe("Install command-line tool on macOS and Linux", () => {
  it("never replaces something else at ~/.local/bin/focus-notes", async () => {
    const home = mkdtempSync(join(tmpdir(), "fn-home-"));
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    writeFileSync(join(home, ".local", "bin", "focus-notes"), "#!/bin/sh\necho mine\n");
    const h: InstallHost = { platform: "linux", binDir: "/opt/Focus Notes/resources/bin", home, envPath: "/usr/bin", powershell: async () => ({ code: 1, stdout: "" }) };
    await expect(installCli(h)).rejects.toThrow(/Something else/);
    expect(readFileSync(join(home, ".local", "bin", "focus-notes"), "utf8")).toBe("#!/bin/sh\necho mine\n");
    expect(await cliInstallState(h)).toEqual({ installed: false, onPath: false });
  });
});
