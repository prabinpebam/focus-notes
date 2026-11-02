/**
 * The Git the Microsoft Store package carries (PKG-13, D-228): GitHub Desktop's dugite-native build
 * at `resources\git`, so a Store install needs no other software. When it's there, every Git call and
 * every sign-in helper uses it; when it isn't (the installer, the portable, development), the
 * system's `git` from PATH runs as before (D-22).
 */
import { existsSync } from "node:fs";
import { isAbsolute, join, posix } from "node:path";

export interface GitBundle {
  /** The bundle's folder: `cmd`, `etc`, `ucrt64`, `usr`. */
  root: string;
  /** `cmd\git.exe`, the program every call starts. */
  git: string;
  /** `cmd`, put first on PATH so Git's helpers find this Git, not another. */
  cmdDir: string;
}

/** `FOCUS_NOTES_GIT_BUNDLE`'s folder when it's an absolute path on this computer, never a network share. */
function namedBundle(env: NodeJS.ProcessEnv): string | undefined {
  const v = env.FOCUS_NOTES_GIT_BUNDLE?.trim();
  return v && isAbsolute(v) && !/^[\\/]{2}/.test(v) ? v : undefined;
}

/**
 * The bundle beside the app (`resources\git`), else, in a development run only (`electron .`,
 * never a packaged app), the folder `FOCUS_NOTES_GIT_BUNDLE` names, else none. Windows only: it's a
 * Windows build.
 */
export function findGitBundle(
  env: NodeJS.ProcessEnv = process.env,
  resourcesPath: string | undefined = process.resourcesPath,
  platform: NodeJS.Platform = process.platform,
  development: boolean = process.defaultApp === true,
): GitBundle | undefined {
  if (platform !== "win32") return undefined;
  const roots = [resourcesPath ? join(resourcesPath, "git") : undefined, development ? namedBundle(env) : undefined];
  for (const root of roots) {
    if (!root) continue;
    const git = join(root, "cmd", "git.exe");
    if (existsSync(git)) return { root, git, cmdDir: join(root, "cmd") };
  }
  return undefined;
}

/** Where Apple's `/usr/bin/git` finds a real Git: the selected developer folder, then the usual ones. */
const APPLE_DEVELOPER_DIRS = ["/var/db/xcode_select_link", "/Library/Developer/CommandLineTools", "/Applications/Xcode.app/Contents/Developer"];

/**
 * Whether `git` would be Apple's stand-in with no developer tools behind it (D-268). On a Mac
 * without the Command Line Tools, `/usr/bin/git` doesn't run Git: it opens the system's offer to
 * download them. Git is optional (local notes never need it), so this counts as Git not installed
 * and nothing is started; the first run's Git step explains the choice instead.
 */
export function appleGitShimWithoutTools(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): boolean {
  if (platform !== "darwin") return false;
  const first = (env.PATH ?? "").split(":").filter(Boolean).map((dir) => posix.join(dir, "git")).find((path) => exists(path));
  if (first !== "/usr/bin/git") return false;
  const dirs = [env.DEVELOPER_DIR?.trim(), ...APPLE_DEVELOPER_DIRS].filter((d): d is string => Boolean(d));
  return !dirs.some((dir) => exists(posix.join(dir, "usr", "bin", "git")));
}

let cached: GitBundle | null | undefined;
/** The bundle for this process, looked for once. */
export function gitBundle(): GitBundle | undefined {
  if (cached === undefined) cached = findGitBundle() ?? null;
  return cached ?? undefined;
}

/**
 * The environment a process runs in when Git is bundled: the bundle's `cmd` first on PATH, so the
 * sign-in helper and hooks that run `git` reach the same Git, and no inherited GIT_EXEC_PATH sends
 * it to another installation's programs. Git Credential Manager's Windows broker stays off whatever
 * the person's own Git settings say: the bundle leaves out the files it needs (D-270), and only Azure
 * DevOps uses it, never GitHub.
 */
export function bundleEnv(base: NodeJS.ProcessEnv, bundle: GitBundle | undefined = gitBundle()): NodeJS.ProcessEnv {
  if (!bundle) return base;
  const env: NodeJS.ProcessEnv = { ...base };
  // Windows names it Path; a copied environment is case-sensitive, so every spelling is replaced by one.
  const keys = Object.keys(env).filter((k) => k.toUpperCase() === "PATH");
  const current = keys.map((k) => env[k]).find((v) => v) ?? "";
  for (const k of keys) delete env[k];
  env[keys[0] ?? "Path"] = current ? `${bundle.cmdDir};${current}` : bundle.cmdDir;
  delete env.GIT_EXEC_PATH;
  env.GCM_MSAUTH_USEBROKER = "false";
  return env;
}
