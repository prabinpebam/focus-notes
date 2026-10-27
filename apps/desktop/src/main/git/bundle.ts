/**
 * The Git the Microsoft Store package carries (PKG-13, D-228): GitHub Desktop's dugite-native build
 * at `resources\git`, so a Store install needs no other software. When it's there, every Git call and
 * every sign-in helper uses it; when it isn't (the installer, the portable, development), the
 * system's `git` from PATH runs as before (D-22).
 */
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

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

let cached: GitBundle | null | undefined;
/** The bundle for this process, looked for once. */
export function gitBundle(): GitBundle | undefined {
  if (cached === undefined) cached = findGitBundle() ?? null;
  return cached ?? undefined;
}

/**
 * The environment a process runs in when Git is bundled: the bundle's `cmd` first on PATH, so the
 * sign-in helper and hooks that run `git` reach the same Git, and no inherited GIT_EXEC_PATH sends
 * it to another installation's programs.
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
  return env;
}
