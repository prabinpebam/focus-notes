/**
 * Install command-line tool (WP-7.4, D-165 (2), D-166 (5)): puts the `focus-notes` launcher on the
 * person's `PATH`, for them only, and never with administrator rights. On Windows the launcher's
 * folder joins the user's own `Path` through .NET's `SetEnvironmentVariable(…, "User")`, which tells
 * open programs it changed; the folder travels in an environment variable, never in the script's
 * text. On macOS and Linux `~/.local/bin/focus-notes` becomes a link to the launcher, never replacing
 * anything that isn't already that link. Only an installed app offers it (never development builds
 * or journeys, which mustn't change the computer).
 */
import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { join } from "node:path";

export interface CliInstallState { installed: boolean; onPath: boolean }

/** A `Path` value with the folder added at the end, or undefined when it's already there (compared as Windows does: without case or a trailing slash). */
export function pathWithFolder(current: string, folder: string, win: boolean): string | undefined {
  const norm = (p: string) => {
    const t = p.trim().replace(/[\\/]+$/, "");
    return win ? t.toLowerCase() : t;
  };
  const sep = win ? ";" : ":";
  const parts = current.split(sep).filter((p) => p.trim() !== "");
  if (parts.some((p) => norm(p) === norm(folder))) return undefined;
  return [...parts, folder].join(sep);
}

/** The PowerShell that adds `$env:FOCUS_NOTES_BIN` to the user's `Path` when it isn't there. No value is ever part of the script. */
export const WINDOWS_INSTALL_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$bin = $env:FOCUS_NOTES_BIN",
  "if (-not $bin) { exit 2 }",
  "$current = [Environment]::GetEnvironmentVariable('Path', 'User')",
  "if ($null -eq $current) { $current = '' }",
  "$parts = @($current -split ';' | Where-Object { $_.Trim() -ne '' })",
  "$norm = { param($p) $p.Trim().TrimEnd('\\', '/').ToLowerInvariant() }",
  "if (-not ($parts | Where-Object { (& $norm $_) -eq (& $norm $bin) })) {",
  "  [Environment]::SetEnvironmentVariable('Path', (($parts + $bin) -join ';'), 'User')",
  "}",
  "exit 0",
].join("\n");

export interface InstallHost {
  platform: NodeJS.Platform;
  /** The launcher's folder in the installed app (`resources/bin`). */
  binDir: string;
  home: string;
  /** The `PATH` this process started with. */
  envPath: string;
  /** Runs a PowerShell script with extra environment variables, resolving to its exit code (Windows). */
  powershell: (script: string, env: Record<string, string>) => Promise<number>;
  /** The user's own `Path`, as stored (Windows). */
  userPath: () => Promise<string>;
}

const localBin = (h: InstallHost) => join(h.home, ".local", "bin");
const linkOf = (h: InstallHost) => join(localBin(h), "focus-notes");

/** Whether the tool is installed, and whether a new terminal finds it. */
export async function cliInstallState(h: InstallHost): Promise<CliInstallState> {
  if (h.platform === "win32") {
    const there = pathWithFolder(await h.userPath().catch(() => ""), h.binDir, true) === undefined;
    return { installed: there, onPath: there };
  }
  const target = await readlink(linkOf(h)).catch(() => undefined);
  const installed = target === join(h.binDir, "focus-notes");
  return { installed, onPath: installed && pathWithFolder(h.envPath, localBin(h), false) === undefined };
}

/** Installs it. Throws when it can't, leaving anything that was there as it was. */
export async function installCli(h: InstallHost): Promise<CliInstallState> {
  if (h.platform === "win32") {
    const code = await h.powershell(WINDOWS_INSTALL_SCRIPT, { FOCUS_NOTES_BIN: h.binDir });
    if (code !== 0) throw new Error(`PowerShell exited ${code}`);
    return cliInstallState(h);
  }
  const link = linkOf(h);
  const want = join(h.binDir, "focus-notes");
  await mkdir(localBin(h), { recursive: true });
  const st = await lstat(link).catch(() => undefined);
  if (st) {
    // Only ever our own link: a file, a folder, or a link elsewhere stays as it is.
    if (!st.isSymbolicLink() || (await readlink(link)) !== want) throw new Error("Something else is at ~/.local/bin/focus-notes");
  } else await symlink(want, link);
  return cliInstallState(h);
}
