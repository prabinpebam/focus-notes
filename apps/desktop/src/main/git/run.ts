/**
 * Running the user's own `git` (Desktop and Git → Running git): an argument list, never a shell,
 * with `-C <repo>`, prompts off, and no optional locks for reads. Credentials stay in Git's own
 * helper and never appear in arguments (SEC-03).
 */
import { execFile } from "node:child_process";
import { Worker } from "node:worker_threads";

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

/**
 * Starting a process blocks the thread that starts it: on Windows, 10 to 30 ms for each Git command
 * (measured in the main process's profile, D-151 (5)). So Git starts on a worker thread of its own,
 * and the main process, which moves the window and answers the page, only posts the call and gets
 * the result. Where a worker can't start, Git starts here as before.
 */
const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const { execFile } = require("node:child_process");
parentPort.on("message", ({ id, git, args, env, timeout, input }) => {
  const child = execFile(git, args, { env, timeout, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
    if (!error) return parentPort.postMessage({ id, code: 0, stdout, stderr });
    const code = typeof error.code === "number" && !error.killed ? error.code : -1;
    parentPort.postMessage({ id, code, stdout: stdout || "", stderr: (stderr || "") + (error.killed ? "\\n(timed out)" : typeof error.code === "string" ? "\\n" + error.code : "") });
  });
  if (child.stdin) {
    child.stdin.on("error", () => {});
    child.stdin.end(input || "");
  }
});
`;
interface Spawn { git: string; args: string[]; env: NodeJS.ProcessEnv; timeout: number; input?: string }

/** Runs Git on this thread: where a worker isn't available. */
function runHere(s: Spawn): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(s.git, s.args, { env: s.env, timeout: s.timeout, maxBuffer: 256 * 1024 * 1024, windowsHide: true, encoding: "utf8" }, (error, stdout, stderr) => {
      if (!error) return resolve({ code: 0, stdout, stderr });
      const e = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
      resolve({ code: typeof e.code === "number" && !e.killed ? e.code : -1, stdout: stdout ?? "", stderr: `${stderr ?? ""}${e.killed ? "\n(timed out)" : typeof e.code === "string" ? `\n${e.code}` : ""}` });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(s.input ?? "");
  });
}

/**
 * One worker for every Git command, started on the first. It keeps the process running only while a
 * command is under way, as a process started on this thread would: ref'd from a post until the last
 * answer, unref'd when idle. (Ref'd for good, a Node process that ran Git never exited, the bench's
 * hang on CI, QLT-05; unref'd for good, it exited with a command still running.)
 */
let spawner: { post(s: Spawn): Promise<GitResult> } | undefined | null;
function gitSpawner(): { post(s: Spawn): Promise<GitResult> } | undefined {
  if (spawner !== undefined) return spawner ?? undefined;
  try {
    const worker = new Worker(WORKER_SOURCE, { eval: true });
    const waiting = new Map<number, { s: Spawn; resolve: (r: GitResult) => void }>();
    let next = 0;
    worker.on("message", (m: GitResult & { id: number }) => {
      const w = waiting.get(m.id);
      waiting.delete(m.id);
      if (!waiting.size) worker.unref();
      w?.resolve({ code: m.code, stdout: m.stdout, stderr: m.stderr });
    });
    // A worker that fails hands its calls back to this thread, and isn't used again.
    const fail = () => {
      spawner = null;
      for (const w of waiting.values()) void runHere(w.s).then(w.resolve);
      waiting.clear();
    };
    worker.on("error", fail);
    worker.on("exit", fail);
    // Idle from the start. (After the listeners: adding a 'message' listener refs the worker's port.)
    worker.unref();
    spawner = {
      post: (s) => new Promise((resolve) => {
        const id = next++;
        if (!waiting.size) worker.ref();
        waiting.set(id, { s, resolve });
        worker.postMessage({ id, ...s });
      }),
    };
  } catch {
    spawner = null;
  }
  return spawner ?? undefined;
}

/** A runner for the `git` on PATH. `onSpawn` sees every argument list and environment (tests check them). */
export function createRunner(options: { git?: string; env?: NodeJS.ProcessEnv; onSpawn?: (args: string[], env: NodeJS.ProcessEnv) => void; here?: boolean } = {}): GitRunner {
  const git = options.git ?? "git";
  return (call) => {
    const args = ["-C", call.cwd, ...call.args];
    const env = { ...gitEnv(options.env ?? process.env, call.read === true), ...call.env };
    options.onSpawn?.(args, env);
    const s: Spawn = { git, args, env, timeout: call.timeoutMs ?? DEFAULT_TIMEOUT_MS, ...(call.input !== undefined ? { input: call.input } : {}) };
    const worker = options.here ? undefined : gitSpawner();
    return worker ? worker.post(s) : runHere(s);
  };
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
