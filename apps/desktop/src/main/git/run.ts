/**
 * Running the user's own `git` (Desktop and Git → Running git): an argument list, never a shell,
 * with `-C <repo>`, prompts off, and no optional locks for reads. Credentials stay in Git's own
 * helper and never appear in arguments (SEC-03).
 */
import { execFile } from "node:child_process";

export interface GitCall {
  /** The repository's folder, passed as `-C`. */
  cwd: string;
  args: string[];
  /** Text for Git's standard input (pathspecs for `--pathspec-from-file=-`). */
  input?: string;
  timeoutMs?: number;
  /** A read-only command: runs with GIT_OPTIONAL_LOCKS=0, so it never rewrites the index. */
  read?: boolean;
  /** Variables set for this call only, after the scrubbing: a temporary index while resolving (FIL-12). */
  env?: Record<string, string>;
}
export interface GitResult {
  /** The exit code; -1 when Git couldn't start or was stopped by its timeout. */
  code: number;
  stdout: string;
  stderr: string;
}
export type GitRunner = (call: GitCall) => Promise<GitResult>;

export const DEFAULT_TIMEOUT_MS = 60_000;

/** The environment for a background Git command: no prompt can hang the app, and messages are parseable. */
export function gitEnv(base: NodeJS.ProcessEnv, read: boolean): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", LC_ALL: "C", LANGUAGE: "C", GIT_LITERAL_PATHSPECS: "1" };
  // A repository named by the environment (a hook that launched the app) never redirects these calls.
  for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR", "GIT_OPTIONAL_LOCKS"]) delete env[k];
  if (read) env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}

/** A runner for the `git` on PATH. `onSpawn` sees every argument list and environment (tests check them). */
export function createRunner(options: { git?: string; env?: NodeJS.ProcessEnv; onSpawn?: (args: string[], env: NodeJS.ProcessEnv) => void } = {}): GitRunner {
  const git = options.git ?? "git";
  return (call) => new Promise((resolve) => {
    const args = ["-C", call.cwd, ...call.args];
    const env = { ...gitEnv(options.env ?? process.env, call.read === true), ...call.env };
    options.onSpawn?.(args, env);
    const child = execFile(git, args, { env, timeout: call.timeoutMs ?? DEFAULT_TIMEOUT_MS, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (!error) return resolve({ code: 0, stdout, stderr });
      const e = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
      resolve({ code: typeof e.code === "number" && !e.killed ? e.code : -1, stdout: stdout ?? "", stderr: `${stderr ?? ""}${e.killed ? "\n(timed out)" : typeof e.code === "string" ? `\n${e.code}` : ""}` });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(call.input ?? "");
  });
}

/** Commands for one repository run one at a time (Desktop and Git → One at a time). */
export class Queue {
  #tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const r = this.#tail.then(fn, fn);
    this.#tail = r.then(() => {}, () => {});
    return r;
  }
}


/** Why a push, pull, or fetch failed, from Git's own words (LC_ALL=C). */
export function networkProblem(stderr: string): "auth" | "locked" | "conflict" | "offline" | "failed" {
  if (/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Permission denied \(publickey|returned error: 40[13]|Invalid username or password|HTTP 40[13]/i.test(stderr)) return "auth";
  if (/index\.lock|Unable to create '.*\.lock'|another git process/i.test(stderr)) return "locked";
  if (/\[rejected\]|non-fast-forward|fetch first|\(conflict\)|CONFLICT/i.test(stderr)) return "conflict";
  if (/Could not resolve host|unable to access|Failed to connect|Connection (timed out|refused|reset)|Could not read from remote|does not appear to be a git repository|Network is unreachable|timed out|early EOF|unable to connect|ENOTFOUND/i.test(stderr)) return "offline";
  return "failed";
}

/** Why a commit failed: hooks are never skipped, so a refused commit says so (Desktop and Git → Running git). */
export function commitProblem(stderr: string): "identity" | "locked" | "signing" | "hook" {
  if (/Please tell me who you are|unable to auto-detect email|empty ident/i.test(stderr)) return "identity";
  if (/index\.lock|Unable to create '.*\.lock'|another git process/i.test(stderr)) return "locked";
  if (/gpg failed|failed to sign|signing failed|cannot run gpg|ssh-keygen/i.test(stderr)) return "signing";
  return "hook";
}
