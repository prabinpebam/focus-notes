/**
 * Copies already on this computer (D-415) with real Git in temporary folders and a local bare remote:
 * the same repository under any spelling of its address is found, a folder with only the same name is
 * not, and using a copy fast-forwards it only when that changes nothing that's only here.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRunner } from "../src/main/git/run.ts";
import { findCopies, normaliseRemote, reuseCopy } from "../src/main/first-run/existing-copies.ts";

const env = { ...process.env, GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@example.com", GIT_CONFIG_NOSYSTEM: "1" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const runner = createRunner({ env });

/** A bare remote with one commit on main, and the folder it's in. */
function world() {
  const root = mkdtempSync(join(tmpdir(), "fn-copies-"));
  const remote = join(root, "remote.git");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  const seed = join(root, "seed");
  git(root, "clone", remote, seed);
  writeFileSync(join(seed, "a.md"), "# A\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-m", "first");
  git(seed, "push", "origin", "HEAD:main");
  const clone = (name: string) => (git(root, "clone", remote, join(root, name)), join(root, name));
  const push = (text: string) => {
    writeFileSync(join(seed, "a.md"), text);
    git(seed, "commit", "-am", text.trim());
    git(seed, "push", "origin", "HEAD:main");
  };
  return { root, remote, seed, clone, push };
}

describe("normaliseRemote (D-415)", () => {
  it("spells the same GitHub repository the same over HTTPS, SSH and with or without .git and case", () => {
    const forms = [
      "https://github.com/Prabin/Notes.git", "https://github.com/prabin/notes", "https://user@github.com/prabin/notes/",
      "git@github.com:prabin/notes.git", "ssh://git@github.com/Prabin/notes.git", "https://www.github.com/prabin/notes.git",
    ];
    expect(new Set(forms.map(normaliseRemote))).toEqual(new Set(["github.com/prabin/notes"]));
    expect(normaliseRemote("https://github.com/prabin/notes-2")).not.toBe(normaliseRemote("https://github.com/prabin/notes"));
    expect(normaliseRemote("https://github.com/other/notes")).not.toBe(normaliseRemote("https://github.com/prabin/notes"));
    expect(normaliseRemote("  ")).toBeUndefined();
  });
});

describe("findCopies (D-415)", () => {
  it("finds clones of the same remote under any URL form, never a folder with only the same name, no Git, or a read error", async () => {
    const w = world();
    const a = w.clone("notes");
    const b = w.clone("notes 2");
    // The same repository, its origin spelt another way.
    git(b, "remote", "set-url", "origin", `file:///${w.remote.replace(/\\/g, "/").replace(/^\//, "")}/`);
    // Same name pattern, another remote.
    const other = join(w.root, "other.git");
    git(w.root, "init", "--bare", other);
    const c = join(w.root, "notes 3");
    git(w.root, "init", c);
    git(c, "remote", "add", "origin", other);
    // No Git at all.
    const d = join(w.root, "notes 4");
    mkdirSync(d);
    writeFileSync(join(d, "x.md"), "x");
    // A folder Git can't read: its config is broken.
    const e = w.clone("notes 5");
    writeFileSync(join(e, ".git", "config"), "[broken\n");
    let unreadable = 0;
    const found = await findCopies(runner, w.remote, [a, b, c, d, e, join(w.root, "missing"), a], () => unreadable++);
    expect(found.map((f) => f.name).sort()).toEqual(["notes", "notes 2"]);
    expect(unreadable).toBe(1);
  });

  it("puts the most recently updated copy first", async () => {
    const w = world();
    const old = w.clone("notes");
    // Commit times are in seconds: the newer one must land in a later second.
    await new Promise((r) => setTimeout(r, 1100));
    w.push("# A\nnewer\n");
    const fresh = w.clone("notes 2");
    const found = await findCopies(runner, w.remote, [old, fresh]);
    expect(found.map((f) => f.folder)).toEqual([fresh, old]);
    expect(found[0]!.updated).toBeGreaterThanOrEqual(found[1]!.updated);
  });

  it("finds a copy by any of the repository's addresses (its clone address or GitHub's)", async () => {
    const w = world();
    const a = w.clone("notes");
    git(a, "remote", "set-url", "origin", "https://github.com/Ada/Notes");
    expect(await findCopies(runner, w.remote, [a])).toEqual([]);
    expect((await findCopies(runner, [w.remote, "https://github.com/ada/notes.git"], [a])).map((f) => f.name)).toEqual(["notes"]);
  });

  it("only reads: nothing in a candidate changes", async () => {
    const w = world();
    const a = w.clone("notes");
    const before = git(a, "status", "--porcelain") + readFileSync(join(a, ".git", "config"), "utf8");
    await findCopies(runner, w.remote, [a]);
    expect(git(a, "status", "--porcelain") + readFileSync(join(a, ".git", "config"), "utf8")).toBe(before);
  });
});

describe("reuseCopy (D-415): fetch and fast-forward only", () => {
  const head = (dir: string) => git(dir, "rev-parse", "HEAD");

  it("fast-forwards a clean copy that's behind", async () => {
    const w = world();
    const a = w.clone("notes");
    w.push("# A\nnew\n");
    expect((await reuseCopy(runner, a)).project).toBe("updated");
    expect(head(a)).toBe(git(w.seed, "rev-parse", "HEAD"));
  });

  it("leaves a copy with uncommitted changes exactly as it is", async () => {
    const w = world();
    const a = w.clone("notes");
    w.push("# A\nnew\n");
    writeFileSync(join(a, "a.md"), "# A\nmine, not committed\n");
    const before = head(a);
    expect((await reuseCopy(runner, a)).project).toBe("dirty");
    expect(head(a)).toBe(before);
    expect(readFileSync(join(a, "a.md"), "utf8")).toBe("# A\nmine, not committed\n");
  });

  it("leaves a copy with unpushed commits, or one that has diverged, untouched", async () => {
    const w = world();
    const ahead = w.clone("notes");
    writeFileSync(join(ahead, "b.md"), "b");
    git(ahead, "add", "-A");
    git(ahead, "commit", "-m", "mine");
    const aheadHead = head(ahead);
    expect((await reuseCopy(runner, ahead)).project).toBe("ahead");
    expect(head(ahead)).toBe(aheadHead);

    w.push("# A\ntheirs\n");
    const diverged = ahead;
    expect((await reuseCopy(runner, diverged)).project).toBe("diverged");
    expect(head(diverged)).toBe(aheadHead);
    expect(git(diverged, "log", "--format=%s", "-1")).toBe("mine");
  });

  it("opens a copy it can't reach as it is", async () => {
    const w = world();
    const a = w.clone("notes");
    git(a, "remote", "set-url", "origin", join(w.root, "gone.git"));
    const before = head(a);
    expect((await reuseCopy(runner, a)).project).toBe("offline");
    expect(head(a)).toBe(before);
  });
});

