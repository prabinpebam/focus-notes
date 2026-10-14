/**
 * An instance for the M3 journeys (WP-3.3, WP-3.4): a notes repository with `private/` as a
 * submodule, each with a local bare remote, cloned as the workspace, so nothing touches the network.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "protocol.file.allow=always", "-c", "core.autocrlf=false", ...(cwd.endsWith(".git") ? [`--git-dir=${cwd}`] : []), ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trim();
export const configure = (dir: string) => {
  for (const [k, v] of [["user.name", "Test"], ["user.email", "test@example.com"], ["commit.gpgsign", "false"], ["core.autocrlf", "false"]]) git(dir, "config", k!, v!);
};
export const write = (p: string, text: string) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
};

/** An instance: a notes repository with `private/` as a submodule, each with a local bare remote, cloned as the workspace. */
export function instance() {
  const root = mkdtempSync(join(tmpdir(), "fn-m3-"));
  const notesRemote = join(root, "notes.git");
  const privateRemote = join(root, "private.git");
  git(root, "init", "-q", "--bare", "-b", "main", notesRemote);
  git(root, "init", "-q", "--bare", "-b", "main", privateRemote);
  const seedP = join(root, "seed-private");
  git(root, "clone", "-q", privateRemote, seedP);
  configure(seedP);
  write(join(seedP, "notes", "welcome.md"), "# Welcome\n\nFirst line.\n");
  git(seedP, "add", "-A");
  git(seedP, "commit", "-q", "-m", "Start");
  git(seedP, "push", "-q", "-u", "origin", "main");
  const seedN = join(root, "seed-notes");
  git(root, "clone", "-q", notesRemote, seedN);
  configure(seedN);
  write(join(seedN, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
  write(join(seedN, "notes", "hello.md"), "# Hello\n");
  git(seedN, "submodule", "add", "-q", "-b", "main", privateRemote, "private");
  git(seedN, "add", "-A");
  git(seedN, "commit", "-q", "-m", "Start");
  git(seedN, "push", "-q", "-u", "origin", "main");
  const docs = join(root, "ws");
  git(root, "clone", "-q", "--recurse-submodules", notesRemote, docs);
  configure(docs);
  configure(join(docs, "private"));
  git(join(docs, "private"), "checkout", "-q", "main");
  return { dirs: { docs, userData: mkdtempSync(join(tmpdir(), "fn-user-")) }, notesRemote, privateRemote };
}
