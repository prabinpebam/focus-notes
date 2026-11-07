/**
 * Delete project on the desktop (PRJ-23, DD-PROJ-13 and 15): what would be deleted, read with real Git
 * in a temporary folder; whether GitHub still has the repository, against a fake API; which folders
 * never go to the Recycle Bin; and the move itself with a fake Recycle Bin. Nothing real is deleted.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubError } from "@focus-notes/github";
import { createRunner } from "../src/main/git/run.ts";
import { deletionCheck, deletionGate, isRepoSlug, keptPrivateFolder, recycleProject, recycleRefusal, repoStatus } from "../src/main/workspace/delete.ts";

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
    const c = await deletionCheck(createRunner(), folder, { repo: "ada/field-notes", privateRepo: "ada/field-notes-private" });
    expect(c).toMatchObject({ kind: "linked", repo: "ada/field-notes", privateRepo: "ada/field-notes-private", siteNotes: 3 });
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
  it("a repository name is owner/name, never a path", () => {
    expect(isRepoSlug("ada/field-notes")).toBe(true);
    for (const s of ["ada", "ada/..", "../x/y", "ada/x/y", "ada/a b", 3]) expect(isRepoSlug(s)).toBe(false);
  });
});

describe("DD-PROJ-13: whether GitHub still has the repository", () => {
  const api = (repo: () => unknown, user: () => unknown = () => ({ login: "ada" })) => ({
    request: async <T,>() => repo() as T,
    user: async () => user(),
  });
  const fail = (status: number, message = "x") => () => { throw new GitHubError(status, message); };
  it("reads the owner, whether you're an admin, and an organization", async () => {
    expect(await repoStatus(api(() => ({ owner: { login: "lab", type: "Organization" }, permissions: { admin: true } })), "lab/notes"))
      .toEqual({ state: "exists", admin: true, owner: "lab", organization: true });
    expect(await repoStatus(api(() => ({ owner: { login: "grace", type: "User" }, permissions: { admin: false } })), "grace/notes"))
      .toMatchObject({ state: "exists", admin: false, owner: "grace" });
  });
  it("a 404 is gone only while the account still answers; otherwise sign in", async () => {
    expect(await repoStatus(api(fail(404)), "ada/notes")).toEqual({ state: "gone" });
    expect(await repoStatus(api(fail(404), fail(401)), "ada/notes")).toEqual({ state: "signin" });
  });
  it("offline, signed out and a rate limit are named", async () => {
    expect(await repoStatus(api(fail(0)), "ada/notes")).toEqual({ state: "offline" });
    expect(await repoStatus(api(() => { throw new TypeError("fetch failed"); }), "ada/notes")).toEqual({ state: "offline" });
    expect(await repoStatus(api(fail(401)), "ada/notes")).toEqual({ state: "signin" });
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
  it("a folder that can't go puts the private notes back and names the file held", async () => {
    const { folder } = project();
    mkdirSync(join(folder, "private"));
    const r = await recycleProject(folder, { keepPrivate: true, trash: async () => { throw new Error("in use"); }, holder: async () => "notes/Ideas.md" });
    expect(r).toEqual({ state: "locked", file: "notes/Ideas.md" });
    expect(existsSync(join(folder, "private"))).toBe(true);
  });
});
