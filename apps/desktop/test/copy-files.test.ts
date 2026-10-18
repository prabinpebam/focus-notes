/** Copy in Files (D-192): files onto the system's clipboard, by each system's own tool, with the paths never in the command. */
import { describe, expect, it } from "vitest";
import { COPY_PATHS_ENV, copyCommand, copyFilesToClipboard, gnomeCopiedFiles } from "../src/main/copy-files.ts";

describe("Copy puts files on the clipboard (D-192)", () => {
  it("Windows and macOS run their own tool; the paths go in the environment, never in the arguments", async () => {
    const paths = ["C:\\Notes\\notes\\It's $(rm -rf) `x`.md", "C:\\Notes\\notes\\Ideas"];
    for (const platform of ["win32", "darwin"] as const) {
      const runs: { file: string; args: string[]; env: NodeJS.ProcessEnv }[] = [];
      await copyFilesToClipboard(paths, { platform, run: async (file, args, env) => void runs.push({ file, args, env }), writeBuffer: () => { throw new Error("not here"); } });
      expect(runs).toHaveLength(1);
      expect(runs[0]!.file).toBe(platform === "win32" ? copyCommand("win32")!.file : "/usr/bin/osascript");
      expect(runs[0]!.args.join(" ")).not.toContain("It's");
      expect(runs[0]!.args.join(" ")).toContain(COPY_PATHS_ENV);
      expect(runs[0]!.env[COPY_PATHS_ENV]).toBe(paths.join("\n"));
    }
    expect(copyCommand("win32")!.args).toContain("-NonInteractive");
    // By absolute path, never found on the PATH or in the working folder (D-166 (5)).
    expect(copyCommand("win32", "D:\\Win")!.file).toBe("D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  });
  it("Linux writes GNOME's copied-files format with file URLs", async () => {
    const written: [string, string][] = [];
    await copyFilesToClipboard(["/home/ada/Notes/a b#1.md", "/home/ada/Notes/Ideas"], { platform: "linux", run: async () => { throw new Error("not here"); }, writeBuffer: (f, d) => void written.push([f, d.toString("utf8")]) });
    expect(written).toEqual([["x-special/gnome-copied-files", "copy\nfile:///home/ada/Notes/a%20b%231.md\nfile:///home/ada/Notes/Ideas"]]);
    expect(gnomeCopiedFiles([])).toBe("copy");
  });
  it("copies nothing for nothing", async () => {
    let ran = false;
    await copyFilesToClipboard([], { platform: "win32", run: async () => { ran = true; }, writeBuffer: () => { ran = true; } });
    expect(ran).toBe(false);
  });
});
