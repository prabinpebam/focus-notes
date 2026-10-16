/**
 * Install command-line tool (WP-7.4, D-165 (2), D-166 (5)): puts the `focus-notes` launcher on the
 * person's `PATH`, for them only, and never with administrator rights.
 *
 * On Windows the user's own `Path` (`HKCU\Environment`) is read raw, without expanding `%VAR%`
 * names, with its value kind; the new value is worked out here (a pure function, tested); and it's
 * written back with the same kind (`REG_EXPAND_SZ` stays expandable), only if the value is still the
 * one read, then open programs are told (`WM_SETTINGCHANGE`), and the value is read back to check.
 * Two fixed PowerShell scripts, run from a temporary file with `-File` by its absolute path, do the
 * reading and writing through `Microsoft.Win32.Registry`; every value travels in environment
 * variables (base64), never in a script's text. On macOS and Linux `~/.local/bin/focus-notes`
 * becomes a link to the launcher, never replacing anything that isn't already that link. Only an
 * installed app offers it (never development builds or journeys, which mustn't change the computer).
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

/** Reads `HKCU\Environment\Path` raw (no `%VAR%` expansion): prints `<kind>:<base64 of UTF-8>`. */
export const WINDOWS_READ_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$kind = 'None'",
  "$value = ''",
  "$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')",
  "if ($null -ne $key) {",
  "  if ($key.GetValueNames() -contains 'Path') {",
  "    $kind = $key.GetValueKind('Path').ToString()",
  "    $value = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)",
  "  }",
  "  $key.Close()",
  "}",
  "[Console]::Out.Write($kind + ':' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($value)))",
  "exit 0",
  "",
].join("\r\n");

/**
 * Writes `HKCU\Environment\Path` with the kind it had, only if it's still the value read (exit 4
 * otherwise), then broadcasts WM_SETTINGCHANGE. Values come from the environment, base64-encoded.
 */
export const WINDOWS_WRITE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$utf8 = [Text.Encoding]::UTF8",
  "$value = $utf8.GetString([Convert]::FromBase64String($env:FOCUS_NOTES_PATH_VALUE))",
  "$old = $utf8.GetString([Convert]::FromBase64String($env:FOCUS_NOTES_PATH_OLD))",
  "$kind = [Microsoft.Win32.RegistryValueKind]$env:FOCUS_NOTES_PATH_KIND",
  "if ($kind -ne [Microsoft.Win32.RegistryValueKind]::String -and $kind -ne [Microsoft.Win32.RegistryValueKind]::ExpandString) { exit 3 }",
  "$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('Environment')",
  "$now = ''",
  "if ($key.GetValueNames() -contains 'Path') { $now = [string]$key.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }",
  "if ($now -cne $old) { $key.Close(); exit 4 }",
  "$key.SetValue('Path', $value, $kind)",
  "$key.Close()",
  "Add-Type -Namespace FocusNotes -Name Env -MemberDefinition '[DllImport(\"user32.dll\", CharSet = CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);'",
  "$result = [UIntPtr]::Zero",
  "[void][FocusNotes.Env]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)",
  "exit 0",
  "",
].join("\r\n");

export interface InstallHost {
  platform: NodeJS.Platform;
  /** The launcher's folder in the installed app (`resources/bin`). */
  binDir: string;
  home: string;
  /** The `PATH` this process started with. */
  envPath: string;
  /** Runs one of the fixed PowerShell scripts with extra environment variables (Windows). */
  powershell: (script: string, env: Record<string, string>) => Promise<{ code: number; stdout: string }>;
}

export type PathKind = "String" | "ExpandString" | "None";
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** The user's own `Path`, raw, with its value kind. Anything that isn't a string value is refused. */
export async function readUserPath(h: InstallHost): Promise<{ kind: PathKind; value: string }> {
  const r = await h.powershell(WINDOWS_READ_SCRIPT, {});
  const m = /^(\w+):([A-Za-z0-9+/=]*)$/.exec(r.stdout.trim());
  if (r.code !== 0 || !m) throw new Error("Couldn't read the user's Path");
  const kind = m[1]!;
  if (kind !== "String" && kind !== "ExpandString" && kind !== "None") throw new Error(`The user's Path is a ${kind} value`);
  return { kind, value: Buffer.from(m[2]!, "base64").toString("utf8") };
}

const localBin = (h: InstallHost) => join(h.home, ".local", "bin");
const linkOf = (h: InstallHost) => join(localBin(h), "focus-notes");
/** A folder that can't be a `Path` entry as it is. */
const unsafeFolder = (folder: string) => folder.includes(";") || folder.includes('"') || /[\r\n]/.test(folder);

/** Whether the tool is installed, and whether a new terminal finds it. */
export async function cliInstallState(h: InstallHost): Promise<CliInstallState> {
  if (h.platform === "win32") {
    const there = pathWithFolder((await readUserPath(h).catch(() => ({ value: "" }))).value, h.binDir, true) === undefined;
    return { installed: there, onPath: there };
  }
  const target = await readlink(linkOf(h)).catch(() => undefined);
  const installed = target === join(h.binDir, "focus-notes");
  return { installed, onPath: installed && pathWithFolder(h.envPath, localBin(h), false) === undefined };
}

/** Installs it, and checks it took. Throws when it can't, leaving anything that was there as it was. */
export async function installCli(h: InstallHost): Promise<CliInstallState> {
  if (h.platform === "win32") {
    if (unsafeFolder(h.binDir)) throw new Error("The app's folder can't go on the Path");
    const current = await readUserPath(h);
    const next = pathWithFolder(current.value, h.binDir, true);
    if (next !== undefined) {
      // A Path that isn't there yet is made expandable, as Windows makes it.
      const kind = current.kind === "None" ? "ExpandString" : current.kind;
      const r = await h.powershell(WINDOWS_WRITE_SCRIPT, { FOCUS_NOTES_PATH_VALUE: b64(next), FOCUS_NOTES_PATH_OLD: b64(current.value), FOCUS_NOTES_PATH_KIND: kind });
      if (r.code !== 0) throw new Error(r.code === 4 ? "The Path changed while installing: try again" : `PowerShell exited ${r.code}`);
    }
    const after = await cliInstallState(h);
    if (!after.installed) throw new Error("The Path didn't change");
    return after;
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
