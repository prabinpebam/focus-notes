/**
 * Fake sign-in helpers on PATH, in a temporary folder, for the first run's tests and journeys: a
 * credential helper (named like Git Credential Manager's, or not), GCM's own program, and the
 * GitHub CLI, each a small shim that runs fake-tools.mjs with Node. Git's settings are isolated in
 * a global config of its own, with the system's turned off, so no real helper or account is used.
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

export interface Fakes {
  root: string;
  /** The environment the app or the tests run in: PATH with the fakes and no real gh, Git's settings isolated. */
  env: Record<string, string>;
  home: string;
  gitconfig: string;
  /** What Git's credential helper holds. */
  store(token?: string, login?: string): void;
  /** The GitHub CLI's own session. */
  session(token: string, login?: string): void;
  /** The account the next sign-ins through GCM or the GitHub CLI end up as (switching account). */
  signInAs(token: string, login: string): void;
  /** How the next sign-ins end: "ok", "declined", "expired", "offline". */
  outcomes(list: string[]): void;
  /** Every argument list the fakes were given. */
  argv(): string;
  stored(): string;
}

const slash = (p: string) => p.replace(/\\/g, "/");
const win = process.platform === "win32";

/** The folders of the real programs the fakes need (Git, Node, the system's). */
function realDirs(): string[] {
  const git = win
    ? execFileSync("where", ["git"], { encoding: "utf8" }).split(/\r?\n/).find((l) => l.toLowerCase().endsWith("git.exe"))
    : execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const dirs = [dirname(process.execPath), git ? dirname(git) : ""];
  if (win) dirs.push(join(process.env.SystemRoot ?? "C:\\Windows", "System32"));
  else dirs.push("/usr/bin", "/bin");
  return [...new Set(dirs.filter(Boolean))];
}

/** The real sign-in helpers, which the tests must never find: the GitHub CLI and Git Credential Manager. */
const REAL_HELPER = /^(gh|git-credential-manager(-core)?)(\.(exe|cmd|bat))?$/i;
let systemDirs: string[] | undefined;

/**
 * The system's programs without the real sign-in helpers, so that the tests find only the fakes
 * whatever the computer has installed. Runners and developers' computers have the GitHub CLI in
 * /usr/bin or next to Git (Homebrew), so on macOS and Linux the system's folders are mirrored, once
 * per process, as links to every program in them except the helpers. On Windows Git's, Node's, and
 * System32's folders hold no helper (Git Credential Manager is in Git's mingw64 folder, which isn't
 * on PATH); that is checked, so a computer where it isn't so fails loudly rather than signing in.
 */
function hermeticSystemDirs(): string[] {
  if (systemDirs) return systemDirs;
  const dirs = realDirs();
  if (win) {
    for (const dir of dirs) {
      const found = readdirSync(dir).find((n) => REAL_HELPER.test(n));
      if (found) throw new Error(`The fakes need a PATH without real sign-in helpers, but ${join(dir, found)} is next to Git or Node`);
    }
    return (systemDirs = dirs);
  }
  const mirror = mkdtempSync(join(tmpdir(), "fn-system-bin-"));
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) {
      const link = join(mirror, name);
      if (REAL_HELPER.test(name) || existsSync(link)) continue;
      // Linked by name, not to the link's target: some programs act on the name they're started by.
      try {
        symlinkSync(join(dir, name), link);
      } catch {
        // Already linked from an earlier folder (a dangling link isn't found by existsSync): the first one wins, as on PATH.
      }
    }
  }
  return (systemDirs = [mirror]);
}

export function makeFakes(opts: { token: string; login?: string; gcm?: boolean; gh?: boolean; helper?: boolean; delayMs?: number }): Fakes {
  const root = mkdtempSync(join(tmpdir(), "fn-fakes-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  mkdirSync(bin, { recursive: true });
  mkdirSync(home, { recursive: true });
  copyFileSync(join(import.meta.dirname, "fake-tools.mjs"), join(bin, "fake-tools.mjs"));
  const shim = (name: string, role: string) => {
    if (win) writeFileSync(join(bin, `${name}.cmd`), `@node "%~dp0fake-tools.mjs" ${role} %*\r\n`);
    else {
      writeFileSync(join(bin, name), `#!/bin/sh\nexec node "$(dirname "$0")/fake-tools.mjs" ${role} "$@"\n`);
      chmodSync(join(bin, name), 0o755);
    }
  };
  if (opts.gcm) shim("git-credential-manager", "gcm");
  if (opts.gh) shim("gh", "gh");
  // With GCM, Git's helper setting names it (as Git for Windows' "manager" does).
  const helperScript = join(bin, opts.gcm ? "git-credential-manager-store.mjs" : "fake-tools.mjs");
  if (opts.gcm) copyFileSync(join(import.meta.dirname, "fake-tools.mjs"), helperScript);
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, [
    ...(opts.helper === false ? [] : ["[credential]", `\thelper = "!node '${slash(helperScript)}' helper"`]),
    "[protocol \"file\"]", "\tallow = always", "[commit]", "\tgpgsign = false", "[core]", "\tautocrlf = false", "[init]", "\tdefaultBranch = main", "",
  ].join("\n"));
  writeFileSync(join(root, "config.json"), JSON.stringify({ token: opts.token, login: opts.login ?? "ada", delayMs: opts.delayMs ?? 300 }));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k.toUpperCase() !== "PATH" && !k.startsWith("GIT_") && !k.startsWith("GH_")) env[k] = v;
  Object.assign(env, { PATH: [bin, ...hermeticSystemDirs()].join(delimiter), GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1", FAKE_GH_DIR: root, HOME: home, USERPROFILE: home, GH_CONFIG_DIR: join(root, "gh-config") });
  const read = (name: string) => (existsSync(join(root, name)) ? readFileSync(join(root, name), "utf8") : "");
  return {
    root, env, home, gitconfig,
    store: (token, login = "ada") => writeFileSync(join(root, "store.json"), JSON.stringify(token ? { "github.com": { username: login, password: token } } : {})),
    session: (token, login = "ada") => writeFileSync(join(root, "session.json"), JSON.stringify({ token, login })),
    signInAs: (token, login) => writeFileSync(join(root, "config.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(root, "config.json"), "utf8")), token, login })),
    outcomes: (list) => writeFileSync(join(root, "outcomes.json"), JSON.stringify(list)),
    argv: () => read("argv.log"),
    stored: () => read("store.json"),
  };
}
