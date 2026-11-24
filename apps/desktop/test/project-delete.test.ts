/**
 * Delete project on the desktop (PRJ-23, DD-PROJ-13 and 15): what would be deleted, read with real Git
 * in a temporary folder; whether GitHub still has the repository, against a fake API; which folders
 * never go to the Recycle Bin; and the move itself with a fake Recycle Bin. Nothing real is deleted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { GitHubError } from "@focus-notes/github";
import { createRunner } from "../src/main/git/run.ts";
import { deletionCheck, deletionFolderIdentity, deletionGate, isRepoSlug, keptPrivateFolder, optionalPlace, recycleProject, recycleRefusal, repoStatus, RemoteProjectDeletion, sameDeletionFolder } from "../src/main/workspace/delete.ts";

const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@e.st", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "pipe" });
function project() {
  const root = mkdtempSync(join(tmpdir(), "fn-delete-"));
  const folder = join(root, "Field notes");
  mkdirSync(join(folder, "notes", "Trips"), { recursive: true });
  writeFileSync(join(folder, "notes", "Ideas.md"), "# Ideas\n");
  writeFileSync(join(folder, "notes", "Trips", "Iceland.md"), "# Iceland\n");
  git(folder, "init", "-q", "-b", "main");
  git(folder, "add", "-A");
  git(folder, "commit", "-qm", "First");
  return { root, folder };
}
/** A fake Recycle Bin: the folder moves into it, never removed. */
function bin(root: string) {
  const to = join(root, "bin");
  mkdirSync(to, { recursive: true });
  const moved: string[] = [];
  return { moved, trash: async (p: string) => { renameSync(p, join(to, String(moved.length))); moved.push(p); } };
}

function privateSubmodule() {
  const { root, folder } = project();
  const vault = join(root, "vault");
  mkdirSync(join(vault, "notes"), { recursive: true });
  writeFileSync(join(vault, "notes", "Secret.md"), "# Private history\n");
  git(vault, "init", "-qb", "main");
  git(vault, "add", "-A");
  git(vault, "commit", "-qm", "Start private history");
  git(folder, "-c", "protocol.file.allow=always", "submodule", "add", "-q", vault, "private");
  const priv = join(folder, "private");
  writeFileSync(join(priv, "notes", "Secret.md"), "# Unpushed private history\n");
  git(priv, "add", "-A");
  git(priv, "commit", "-qm", "Keep an unpushed private change");
  const head = git(priv, "rev-parse", "HEAD").toString();
  writeFileSync(join(priv, "notes", "Draft.md"), "# Unsaved private draft\n");
  const metadata = join(folder, ".git", "modules", "private");
  return { root, folder, priv, metadata, head, pointer: readFileSync(join(priv, ".git")), config: readFileSync(join(metadata, "config")) };
}

describe("PRJ-23: what deleting would delete", () => {
  it("an offline project: the whole folder, with no list of what isn't on GitHub", async () => {
    const { folder } = project();
    const c = await deletionCheck(createRunner(), folder, {});
    expect(c).toMatchObject({ kind: "offline", name: "Field notes", repo: "", privateRepo: "", unsynced: [] });
    expect(c.problem).toBeUndefined();
  });
  it("a linked project: notes changed or never pushed, and how many the site publishes", { timeout: 30_000 }, async () => {
    const { root, folder } = project();
    const remote = join(root, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote]);
    git(folder, "remote", "add", "origin", remote);
    git(folder, "push", "-q", "origin", "main");
    writeFileSync(join(folder, "notes", "Ideas.md"), "# Ideas\n\nMore.\n");
    writeFileSync(join(folder, "notes", "New.md"), "# New\n");
    const c = await deletionCheck(createRunner(), folder, { repo: "ada/field-notes", siteRepo: "ada/field-notes-site", privateRepo: "ada/field-notes-private" });
    expect(c).toMatchObject({ kind: "linked", repo: "ada/field-notes", siteRepo: "ada/field-notes-site", privateRepo: "ada/field-notes-private", siteNotes: 3 });
    expect(c.unsynced).toEqual(["notes/Ideas.md", "notes/New.md"]);
  });
  it("a folder that isn't its own repository is not a project", async () => {
    const { folder } = project();
    const c = await deletionCheck(createRunner(), join(folder, "notes"), { repo: "ada/field-notes" });
    expect(c.problem).toBe("notProject");
  });
  it("D-pending: a project New project made (no workspace format file) reaches the confirmation; Local notes and a deleted project don't", async () => {
    // New project's shape (projects.ts create): notes/, Git on main, an empty first commit, no .focus-notes/.
    const root = mkdtempSync(join(tmpdir(), "fn-delete-new-"));
    const folder = join(root, "Testing deletion");
    mkdirSync(join(folder, "notes"), { recursive: true });
    git(folder, "init", "-q", "-b", "main");
    git(folder, "commit", "-q", "--allow-empty", "-m", "Start the project");
    writeFileSync(join(folder, "untitled.md"), "# Untitled\n");
    expect(existsSync(join(folder, ".focus-notes"))).toBe(false);
    expect(deletionGate({ deleted: false, localNotes: false })).toBeUndefined();
    const c = await deletionCheck(createRunner(), folder, {});
    expect(c.problem).toBeUndefined();
    expect(c).toMatchObject({ kind: "offline", name: "Testing deletion" });
    expect(deletionGate({ deleted: false, localNotes: true })).toBe("notProject");
    expect(deletionGate({ deleted: true, localNotes: false })).toBe("notProject");
  });
  it("D-pending (owner, 17:48): a project whose GitHub creation failed still reaches the first confirmation", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-delete-failed-"));
    // Failed before the first commit (no Git identity yet): an unborn main, notes/ and an uncommitted note.
    const unborn = join(root, "Unborn");
    mkdirSync(join(unborn, "notes"), { recursive: true });
    git(unborn, "init", "-q", "-b", "main");
    writeFileSync(join(unborn, "untitled.md"), "# Untitled\n");
    expect(await deletionCheck(createRunner(), unborn, {})).toMatchObject({ kind: "offline", name: "Unborn" });
    expect((await deletionCheck(createRunner(), unborn, {})).problem).toBeUndefined();
    // Failed after origin was set: the remote names a repository GitHub never made, and nothing was pushed.
    const linked = join(root, "Never pushed");
    mkdirSync(join(linked, "notes"), { recursive: true });
    git(linked, "init", "-q", "-b", "main");
    git(linked, "commit", "-q", "--allow-empty", "-m", "Start the project");
    git(linked, "remote", "add", "origin", "https://github.com/ada/never-made.git");
    writeFileSync(join(linked, "untitled.md"), "# Untitled\n");
    const c = await deletionCheck(createRunner(), linked, { repo: "ada/never-made" });
    expect(c.problem).toBeUndefined();
    expect(c).toMatchObject({ kind: "linked", repo: "ada/never-made" });
    expect(c.unsynced).toContain("untitled.md");
  });
  it("a repository name is owner/name, never a path", () => {
    expect(isRepoSlug("ada/field-notes")).toBe(true);
    for (const s of ["ada", "ada/..", "../x/y", "ada/x/y", "ada/a b", 3]) expect(isRepoSlug(s)).toBe(false);
  });
});

describe("D-413: whether GitHub still has the repository", () => {
  const api = (repo: () => unknown, user: () => unknown = () => ({ id: 1, login: "ada" })) => ({
    request: async <T,>() => repo() as T,
    user: async () => user(),
  });
  const fail = (status: number, message = "x", retryAfterMs?: number) => () => { throw new GitHubError(status, message, retryAfterMs); };
  it("reads the owner, whether you're an admin, and an organization", async () => {
    expect(await repoStatus(api(() => ({ owner: { login: "lab", type: "Organization" }, permissions: { admin: true } })), "lab/notes"))
      .toEqual({ state: "exists", admin: true, owner: "lab", organization: true });
    expect(await repoStatus(api(() => ({ owner: { login: "grace", type: "User" }, permissions: { admin: false } })), "grace/notes"))
      .toMatchObject({ state: "exists", admin: false, owner: "grace" });
  });
  it("treats 404 as gone ONLY when GET /user returns 200 with a valid account in the same check", async () => {
    expect(await repoStatus(api(fail(404)), "ada/notes")).toEqual({ state: "gone", account: { id: 1, login: "ada" } });
    expect(await repoStatus(api(fail(404), fail(401)), "ada/notes")).toEqual({ state: "signin" });
    expect(await repoStatus(api(fail(404), fail(403, "Forbidden")), "ada/notes")).toEqual({ state: "error" });
    expect(await repoStatus(api(fail(404), fail(429, "Too many requests", 12_000)), "ada/notes", () => 1000)).toEqual({ state: "rateLimit", retryAt: 13_000 });
    expect(await repoStatus(api(fail(404), fail(500, "Internal")), "ada/notes")).toEqual({ state: "error" });
    expect(await repoStatus(api(fail(404), fail(0, "offline")), "ada/notes")).toEqual({ state: "offline" });
    expect(await repoStatus(api(fail(404), () => ({})), "ada/notes")).toEqual({ state: "signin" });
  });
  it("401, 403, 429, 5xx, offline and timeouts are never gone, and Retry-After is respected", async () => {
    expect(await repoStatus(api(fail(0)), "ada/notes")).toEqual({ state: "offline" });
    expect(await repoStatus(api(() => { throw new TypeError("fetch failed"); }), "ada/notes")).toEqual({ state: "offline" });
    expect(await repoStatus(api(fail(401)), "ada/notes")).toEqual({ state: "signin" });
    expect(await repoStatus(api(fail(403, "Forbidden")), "ada/notes")).toEqual({ state: "error" });
    expect(await repoStatus(api(fail(502, "Bad gateway")), "ada/notes")).toEqual({ state: "error" });
    expect(await repoStatus(api(fail(429, "Rate limit", 25_000)), "ada/notes", () => 1000)).toEqual({ state: "rateLimit", retryAt: 26_000 });
    expect(await repoStatus(api(fail(403, "API rate limit exceeded")), "ada/notes", () => 1000)).toEqual({ state: "rateLimit", retryAt: 61_000 });
    expect(await repoStatus(undefined, "ada/notes")).toEqual({ state: "signin" });
  });
});

describe("DD-PROJ-15: to the Recycle Bin", () => {
  it("never a drive's root, the home folder, Documents, Desktop or the app's data", () => {
    const { root, folder } = project();
    const places = { home: root, userData: join(folder, "data"), documents: join(root, "Documents"), desktop: join(root, "Desktop") };
    mkdirSync(places.documents);
    mkdirSync(places.userData);
    expect(recycleRefusal(folder, places)).toBe("appData");
    expect(recycleRefusal(root, { ...places, userData: join(tmpdir(), "elsewhere") })).toBe("personal");
    expect(recycleRefusal(places.documents, { ...places, userData: join(tmpdir(), "elsewhere") })).toBe("personal");
    expect(recycleRefusal(join(root, "missing"), places)).toBe("missing");
    expect(recycleRefusal(process.platform === "win32" ? "C:\\" : "/", places)).toBe("root");
    expect(recycleRefusal(folder, { ...places, userData: join(tmpdir(), "elsewhere") })).toBeUndefined();
  });
  it("a Documents or Desktop the platform can't name skips its check, and still refuses the others", () => {
    const { root, folder } = project();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const missing = optionalPlace("documents", () => { throw new Error("Failed to get 'documents' path"); });
    expect(missing).toBeUndefined();
    expect(logged).toHaveBeenCalledWith("The documents folder could not be resolved; its check is skipped.");
    logged.mockRestore();
    const places = { home: root, userData: join(tmpdir(), "elsewhere"), documents: missing, desktop: optionalPlace("desktop", () => join(root, "Desktop")) };
    expect(places.desktop).toBe(join(root, "Desktop"));
    expect(recycleRefusal(folder, places)).toBeUndefined();
    expect(recycleRefusal(root, places)).toBe("personal");
  });
  it("any other failure naming a personal folder still fails", () => {
    expect(() => optionalPlace("desktop", () => { throw new Error("Failed to get 'documents' path"); })).toThrow("documents");
    expect(() => optionalPlace("documents", () => { throw new TypeError("unexpected"); })).toThrow("unexpected");
  });

  describe("D-413: verified deletion receipts", () => {
    it("confirmGone marks confirmed only when the verified account matches the preflighted account", async () => {
      const api = {
        user: async () => ({ id: 1, login: "ada" }),
        request: async <T,>(): Promise<T> => ({ id: 42, permissions: { admin: true } } as T),
      };
      const deletion = new RemoteProjectDeletion();
      await deletion.prepare(api, "ada/notes");
      expect(deletion.confirmed("ada/notes")).toBe(false);
      expect(deletion.confirmGone("ada/notes", { id: 2, login: "ada" })).toBe(false);
      expect(deletion.confirmGone("ada/notes", { id: 1, login: "other" })).toBe(false);
      expect(deletion.confirmed("ada/notes")).toBe(false);
      expect(deletion.confirmGone("ada/notes", { id: 1, login: "ada" })).toBe(true);
      expect(deletion.confirmed("ada/notes")).toBe(true);
    });
    it("confirmGone records the verified account for a repository already gone at first check", () => {
      const deletion = new RemoteProjectDeletion();
      expect(deletion.confirmGone("ada/notes", { id: 1, login: "ada" })).toBe(true);
      expect(deletion.confirmed("ada/notes")).toBe(true);
      expect(deletion.account("ada/notes")).toEqual({ id: 1, login: "ada" });
    });
  });
  it("a replacement directory at the same spelling is not the confirmed local folder", async () => {
    const { root, folder } = project();
    const identity = await deletionFolderIdentity(folder);
    expect(await sameDeletionFolder(folder, identity)).toBe(true);
    renameSync(folder, join(root, "original"));
    mkdirSync(folder);
    writeFileSync(join(folder, "Replacement.md"), "# Do not touch\n");
    expect(await sameDeletionFolder(folder, identity)).toBe(false);
    expect(readFileSync(join(folder, "Replacement.md"), "utf8")).toBe("# Do not touch\n");
  });
  it("a changed project before recycling is a refusal, not a private-history failure, when no private notes are kept", async () => {
    const { folder } = project();
    const trash = vi.fn();
    expect(await recycleProject(folder, { keepPrivate: false, current: async () => false, trash })).toEqual({ state: "refused" });
    expect(trash).not.toHaveBeenCalled();
    expect(existsSync(folder)).toBe(true);
  });
  it("moves the folder, keeping the private notes beside it when asked", async () => {
    const { root, folder } = project();
    mkdirSync(join(folder, "private", "notes"), { recursive: true });
    writeFileSync(join(folder, "private", "notes", "Secret.md"), "# S\n");
    const b = bin(root);
    const r = await recycleProject(folder, { keepPrivate: true, trash: b.trash });
    expect(r).toEqual({ state: "deleted", privateKept: join(root, "Field notes (private notes)") });
    expect(existsSync(folder)).toBe(false);
    expect(existsSync(join(root, "Field notes (private notes)", "notes", "Secret.md"))).toBe(true);
    expect(keptPrivateFolder(folder)).toBe(join(root, "Field notes (private notes 2)"));
  });
  it("keeps a retained private submodule's unpushed history independently usable", async () => {
    const { root, folder, head, config } = privateSubmodule();
    const b = bin(root);
    const result = await recycleProject(folder, { keepPrivate: true, trash: b.trash, current: async () => true });
    expect(result.state).toBe("deleted");
    const kept = join(root, "Field notes (private notes)");
    expect(git(kept, "rev-parse", "HEAD").toString()).toBe(head);
    expect(git(kept, "show", "HEAD:notes/Secret.md").toString()).toBe("# Unpushed private history\n");
    expect(readFileSync(join(kept, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
    expect(git(kept, "status", "--porcelain").toString()).toContain("?? notes/Draft.md");
    expect(realpathSync.native(git(kept, "rev-parse", "--show-toplevel").toString().trim()).toLowerCase()).toBe(realpathSync.native(kept).toLowerCase());
    expect(git(kept, "config", "--local", "--get", "core.bare").toString().trim()).toBe("false");
    expect(readFileSync(join(root, "bin", "0", ".git", "modules", "private", "config"))).toEqual(config);
  });
  it("rolls back a retained submodule's exact pointer, config, HEAD and draft when recycling fails", async () => {
    const { folder, priv, metadata, head, pointer, config } = privateSubmodule();
    expect(await recycleProject(folder, { keepPrivate: true, current: async () => true, trash: async () => { throw new Error("Fixture folder held"); } })).toEqual({ state: "locked" });
    expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
    expect(readFileSync(join(metadata, "config"))).toEqual(config);
    expect(git(priv, "rev-parse", "HEAD").toString()).toBe(head);
    expect(git(priv, "status", "--porcelain").toString()).toContain("?? notes/Draft.md");
    expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
    expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
  });
  it("never recycles after intent is invalidated during the deferred private-history copy", async () => {
    const { folder, priv, metadata, head, pointer, config } = privateSubmodule();
    let copying = false;
    let allowed = true;
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const original = fsPromises.cp;
    const copy = vi.spyOn(fsPromises, "cp").mockImplementation(async (...args) => {
      copying = true;
      await held;
      return original(...args);
    });
    syncBuiltinESMExports();
    const trash = vi.fn();
    const operation = recycleProject(folder, { keepPrivate: true, current: async () => allowed, trash });
    try {
      await expect.poll(() => copying).toBe(true);
      allowed = false;
      release();
      expect(await operation).toEqual({ state: "refused" });
      expect(trash).not.toHaveBeenCalled();
      expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
      expect(readFileSync(join(metadata, "config"))).toEqual(config);
      expect(git(priv, "rev-parse", "HEAD").toString()).toBe(head);
      expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
      expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
    } finally { release(); await operation; copy.mockRestore(); syncBuiltinESMExports(); }
  });
  for (const dependency of ["alternates", "commondir", "registeredWorktree", "configInclude", "worktree", "partialClone", "fsmonitor", "hooks", "foreign", "linked"] as const) {
    it(`refuses retained private history with ${dependency} without moving original bytes`, async () => {
      const { root, folder, priv, metadata } = privateSubmodule();
      let sourceMetadata = metadata;
      if (dependency === "alternates") writeFileSync(join(metadata, "objects", "info", "alternates"), join(root, "foreign-objects"));
      else if (dependency === "commondir") writeFileSync(join(metadata, "commondir"), join(root, "foreign-common"));
      else if (dependency === "registeredWorktree") mkdirSync(join(metadata, "worktrees", "other"), { recursive: true });
      else if (dependency === "partialClone") git(priv, "config", "--file", join(metadata, "config"), "remote.origin.promisor", "true");
      else if (dependency === "fsmonitor" || dependency === "hooks") git(priv, "config", "--file", join(metadata, "config"), dependency === "fsmonitor" ? "core.fsmonitor" : "core.hooksPath", join(root, "foreign"));
      else if (dependency === "foreign") {
        sourceMetadata = join(root, "foreign-metadata");
        renameSync(metadata, sourceMetadata);
        git(root, "config", "--file", join(sourceMetadata, "config"), "core.worktree", priv);
        renameSync(join(priv, ".git"), join(root, "original-private-pointer"));
        writeFileSync(join(priv, ".git"), `gitdir: ${sourceMetadata}\n`);
      } else if (dependency === "linked") {
        const link = join(folder, ".git", "modules", "linked");
        symlinkSync(metadata, link, process.platform === "win32" ? "junction" : "dir");
        renameSync(join(priv, ".git"), join(root, "original-private-pointer"));
        writeFileSync(join(priv, ".git"), "gitdir: ../.git/modules/linked\n");
      }
      else git(priv, "config", "--file", join(metadata, "config"), dependency === "configInclude" ? "include.path" : "core.worktree", join(root, "foreign"));
      const pointer = readFileSync(join(priv, ".git"));
      const config = readFileSync(join(sourceMetadata, "config"));
      const trash = vi.fn();
      expect(await recycleProject(folder, { keepPrivate: true, current: async () => true, trash })).toEqual({ state: "failed", reason: "privateHistory" });
      expect(trash).not.toHaveBeenCalled();
      expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
      expect(readFileSync(join(sourceMetadata, "config"))).toEqual(config);
      expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
      expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
    });
  }
  for (const [key, value] of [["core.fsmonitor", "true"], ["core.fsmonitor", "foreign-monitor"], ["core.worktree", "foreign-worktree"], ["include.path", "foreign-config"], ["remote.origin.promisor", "true"], ["core.hooksPath", "foreign-hooks"]] as const) {
    it(`refuses unsafe inherited ${key}=${value} before staging`, async () => {
      const { folder, priv, metadata, pointer, config } = privateSubmodule();
      const trash = vi.fn();
      const count = Number(process.env.GIT_CONFIG_COUNT ?? "0");
      vi.stubEnv(`GIT_CONFIG_KEY_${count}`, key);
      vi.stubEnv(`GIT_CONFIG_VALUE_${count}`, value);
      vi.stubEnv("GIT_CONFIG_COUNT", String(count + 1));
      try {
        expect(await recycleProject(folder, { keepPrivate: true, current: async () => true, trash })).toEqual({ state: "failed", reason: "privateHistory" });
        expect(trash).not.toHaveBeenCalled();
        expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
        expect(readFileSync(join(metadata, "config"))).toEqual(config);
        expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
        expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
      } finally { vi.unstubAllEnvs(); }
    });
  }
  it("refuses inherited shared object storage instead of certifying a copy through it", async () => {
    const { folder, priv, metadata, pointer, config } = privateSubmodule();
    const trash = vi.fn();
    vi.stubEnv("GIT_OBJECT_DIRECTORY", join(metadata, "objects"));
    try {
      expect(await recycleProject(folder, { keepPrivate: true, current: async () => true, trash })).toEqual({ state: "failed", reason: "privateHistory" });
      expect(trash).not.toHaveBeenCalled();
      expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
      expect(readFileSync(join(metadata, "config"))).toEqual(config);
      expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
    } finally { vi.unstubAllEnvs(); }
  });
  it("keeps history with managed bare, credential and disabled monitor controls without changing the host environment", async () => {
    const { root, folder, head } = privateSubmodule();
    const count = Number(process.env.GIT_CONFIG_COUNT ?? "0");
    const controls = [["safe.bareRepository", "explicit"], ["credential.interactive", "false"], ["core.fsmonitor", "false"]];
    for (const [i, [key, value]] of controls.entries()) {
      vi.stubEnv(`GIT_CONFIG_KEY_${count + i}`, key);
      vi.stubEnv(`GIT_CONFIG_VALUE_${count + i}`, value);
    }
    vi.stubEnv("GIT_CONFIG_COUNT", String(count + controls.length));
    const inherited = { ...process.env };
    try {
      const result = await recycleProject(folder, { keepPrivate: true, current: async () => true, trash: bin(root).trash });
      expect(result.state).toBe("deleted");
      expect(git(result.privateKept!, "rev-parse", "HEAD").toString()).toBe(head);
      expect(process.env).toEqual(inherited);
    } finally { vi.unstubAllEnvs(); }
  });
  for (const key of ["include.path", "core.hooksPath", "core.worktree"] as const) {
    it(`refuses effective global ${key} before staging`, async () => {
      const { root, folder, priv, metadata, pointer, config } = privateSubmodule();
      const global = join(root, "fixture-global-config");
      git(root, "config", "--file", global, key, join(root, "foreign"));
      vi.stubEnv("GIT_CONFIG_GLOBAL", global);
      const trash = vi.fn();
      try {
        expect(await recycleProject(folder, { keepPrivate: true, current: async () => true, trash })).toEqual({ state: "failed", reason: "privateHistory" });
        expect(trash).not.toHaveBeenCalled();
        expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
        expect(readFileSync(join(metadata, "config"))).toEqual(config);
        expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
      } finally { vi.unstubAllEnvs(); }
    });
  }
  it("a folder that can't go puts the private notes back and names the file held", async () => {
    const { folder } = project();
    mkdirSync(join(folder, "private"));
    const r = await recycleProject(folder, { keepPrivate: true, trash: async () => { throw new Error("in use"); }, holder: async () => "notes/Ideas.md" });
    expect(r).toEqual({ state: "locked", file: "notes/Ideas.md" });
    expect(existsSync(join(folder, "private"))).toBe(true);
  });
});
