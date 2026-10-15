/**
 * Real Git in temporary folders for the adapter's tests (WP-3.3, WP-3.4): a bare remote for each
 * repository and a workspace clone with `private/` as a submodule, built once and copied per test.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Clock } from "../src/main/git/cadence.ts";

/** A hung Git fails its test with its command named instead of holding the worker (DEF-13). */
const GIT_SETUP_TIMEOUT_MS = 90_000;
export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "protocol.file.allow=always", "-c", "core.autocrlf=false", ...(cwd.endsWith(".git") ? [`--git-dir=${cwd}`] : []), ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, timeout: GIT_SETUP_TIMEOUT_MS }).trim();
export const configure = (dir: string) => {
  for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(dir, "config", k!, v!);
};
export const write = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

/** A notes repository with `private/` as a submodule, each with a bare remote, cloned as a workspace. Built once. */
let built: string | undefined;
/**
 * Builds the template now: call it from `beforeAll` (with SETUP_TIMEOUT_MS), so the first test's time
 * is its own and not a cold runner's first ~20 Git starts, run synchronously (DEF-13). Says how long
 * it took when that was long, so a slow runner shows in the log.
 */
export function prepareTemplate(): void {
  const t0 = Date.now();
  template();
  const ms = Date.now() - t0;
  if (ms > 10_000) console.warn(`[git-fixture] the template took ${ms} ms to build`);
}
/** The time a file's one-time Git setup may take on a cold runner. */
export const SETUP_TIMEOUT_MS = 180_000;
function template(): string {
  if (built) return built;
  const root = mkdtempSync(join(tmpdir(), "fn-git-"));
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(root, "init", "-q", "--bare", "-b", "main", notesRemote);
  git(root, "init", "-q", "--bare", "-b", "main", privateRemote);
  const seedP = join(root, "seed-private");
  git(root, "clone", "-q", privateRemote, seedP);
  configure(seedP);
  write(join(seedP, "notes", "welcome.md"), "# Welcome\n");
  git(seedP, "add", "-A");
  git(seedP, "commit", "-q", "-m", "Start");
  git(seedP, "push", "-q", "-u", "origin", "main");
  const seedN = join(root, "seed-notes");
  git(root, "clone", "-q", notesRemote, seedN);
  configure(seedN);
  write(join(seedN, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  write(join(seedN, "notes", "hello.md"), "# Hello\n\nSee [the list](list.md).\n");
  write(join(seedN, "notes", "list.md"), "# List\n");
  git(seedN, "submodule", "add", "-q", "-b", "main", privateRemote, "private");
  git(seedN, "add", "-A");
  git(seedN, "commit", "-q", "-m", "Start");
  git(seedN, "push", "-q", "-u", "origin", "main");
  const ws = join(root, "ws");
  git(root, "clone", "-q", "--recurse-submodules", notesRemote, ws);
  configure(ws);
  configure(join(ws, "private"));
  git(join(ws, "private"), "checkout", "-q", "main");
  rmSync(seedN, { recursive: true, force: true });
  rmSync(seedP, { recursive: true, force: true });
  return (built = root);
}
/** A fresh copy of the template, its remotes pointing at its own bare repositories (Git on Windows is slow to set up). */
export function instance() {
  const root = mkdtempSync(join(tmpdir(), "fn-git-"));
  cpSync(template(), root, { recursive: true });
  const ws = join(root, "ws");
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(ws, "remote", "set-url", "origin", notesRemote);
  git(join(ws, "private"), "remote", "set-url", "origin", privateRemote);
  return { root, ws, notesRemote, privateRemote };
}
export const subject = (repo: string, ref = "main") => git(repo, "log", "-1", "--format=%s", ref);
export const count = (repo: string, ref = "main") => Number(git(repo, "rev-list", "--count", ref));

export class FakeClock implements Clock {
  t = 1_000_000;
  timers = new Map<number, { at: number; fn: () => void }>();
  #id = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.#id++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  };
  clearTimeout = (h: unknown) => void this.timers.delete(h as number);
  advance(ms: number) {
    this.t += ms;
    for (const [id, v] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (v.at > this.t) continue;
      this.timers.delete(id);
      v.fn();
    }
  }
}
