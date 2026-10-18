/**
 * Copy in Files (D-192): files and folders onto the system's clipboard, as Explorer and Finder
 * copy them, so they paste into a file manager, a mail, or a chat. Electron's clipboard writes
 * text and images only, so each system's own tool does it: PowerShell's `Set-Clipboard -LiteralPath`
 * on Windows, AppKit's pasteboard through `osascript` on macOS, and GNOME's copied-files format on
 * Linux. The paths go in an environment variable, never in the command, so no name can run as code.
 */
import { execFile } from "node:child_process";

export const COPY_PATHS_ENV = "FOCUS_NOTES_COPY_PATHS";

const WINDOWS = `Set-Clipboard -LiteralPath ($env:${COPY_PATHS_ENV} -split "\`n")`;
const MACOS = [
  "ObjC.import('AppKit');",
  `const s = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('${COPY_PATHS_ENV}'));`,
  "const pb = $.NSPasteboard.generalPasteboard; pb.clearContents;",
  "pb.writeObjects($(s.split('\\n').map((p) => $.NSURL.fileURLWithPath(p))));",
].join(" ");

/** The program and arguments that put `paths` on the clipboard, or undefined where Electron does it itself (Linux). */
export function copyCommand(platform: NodeJS.Platform): { file: string; args: string[] } | undefined {
  if (platform === "win32") return { file: "powershell.exe", args: ["-NoProfile", "-NonInteractive", "-Command", WINDOWS] };
  if (platform === "darwin") return { file: "osascript", args: ["-l", "JavaScript", "-e", MACOS] };
  return undefined;
}

/** GNOME's copied-files format (Nautilus, and file managers that read it): "copy", then a file URL per line. */
export function gnomeCopiedFiles(paths: readonly string[]): string {
  return ["copy", ...paths.map((p) => new URL(`file://${p.split("/").map(encodeURIComponent).join("/")}`).href)].join("\n");
}

export interface CopyIo {
  platform: NodeJS.Platform;
  run(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<void>;
  writeBuffer(format: string, data: Buffer): void;
}

export const defaultRun: CopyIo["run"] = (file, args, env) => new Promise((resolve, reject) => {
  execFile(file, args, { env, windowsHide: true, timeout: 10_000 }, (error) => (error ? reject(error) : resolve()));
});

/** Puts files and folders on the clipboard; `paths` are absolute and already checked. */
export async function copyFilesToClipboard(paths: readonly string[], io: CopyIo): Promise<void> {
  if (!paths.length) return;
  const cmd = copyCommand(io.platform);
  if (cmd) return io.run(cmd.file, cmd.args, { ...process.env, [COPY_PATHS_ENV]: paths.join("\n") });
  io.writeBuffer("x-special/gnome-copied-files", Buffer.from(gnomeCopiedFiles(paths), "utf8"));
}
