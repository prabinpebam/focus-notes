/**
 * Delete project on the desktop (PRJ-23, DD-PROJ-13 and 15): what would be deleted, read with real Git
 * in a temporary folder; whether GitHub still has the repository, against a fake API; which folders
 * never go to the Recycle Bin; and the move itself with a fake Recycle Bin. Nothing real is deleted.
 */
import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { GitHubError } from "@focus-notes/github";
import { createRunner } from "../src/main/git/run.ts";
import { deletionCheck, deletionFolderIdentity, deletionGate, isRepoSlug, keptPrivateFolder, recycleProject, recycleRefusal, repoStatus, RemoteProjectDeletion, sameDeletionFolder } from "../src/main/workspace/delete.ts";
import { withDeletionAuthorization } from "../src/main/workspace/delete-authorization.ts";

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

  describe("D-394: actual deletion receipts", () => {
    function remote(opts: { refused?: boolean; visibleAfter?: boolean; uncertain?: boolean } = {}) {
      const requests: string[] = [];
      let sent = false;
      const api = {
        user: async () => ({ id: 1 }),
        request: async <T,>(method: string): Promise<T> => {
          requests.push(method);
          if (method === "DELETE") {
            sent = true;
            if (opts.refused) throw new GitHubError(403, "Forbidden");
            if (opts.uncertain) throw new GitHubError(0, "offline");
            return undefined as T;
          }
          if (sent && !opts.refused && !opts.visibleAfter) throw new GitHubError(404, "Not found");
          return { id: 42, permissions: { admin: true } } as T;
        },
      };
      return { api, requests };
    }
    it("a 403 retains the local-deletion gate and names permission refusal", async () => {
      const fake = remote({ refused: true });
      const deletion = new RemoteProjectDeletion();
      await deletion.prepare(fake.api, "ada/notes");
      expect(await deletion.delete(fake.api, "ada/notes")).toEqual({ state: "refused", reason: "permission" });
      expect(deletion.confirmed("ada/notes")).toBe(false);
    });
    it("accepted DELETE followed by a visible target stays partial; Retry never replays it", async () => {
      const fake = remote({ visibleAfter: true });
      const deletion = new RemoteProjectDeletion();
      await deletion.prepare(fake.api, "ada/notes");
      expect(await deletion.delete(fake.api, "ada/notes")).toEqual({ state: "partial" });
      expect(await deletion.delete(fake.api, "ada/notes")).toEqual({ state: "partial" });
      expect(fake.requests.filter(method => method === "DELETE")).toHaveLength(1);
    });
    it("only acknowledged DELETE and follow-up absence confirm deletion, never an ambiguous transport failure", async () => {
      for (const uncertain of [false, true]) {
        const fake = remote({ uncertain });
        const deletion = new RemoteProjectDeletion();
        await deletion.prepare(fake.api, "ada/notes");
        expect(await deletion.delete(fake.api, "ada/notes")).toEqual({ state: uncertain ? "partial" : "deleted" });
        expect(deletion.confirmed("ada/notes")).toBe(!uncertain);
        expect(await deletion.delete(fake.api, "ada/notes")).toEqual({ state: uncertain ? "partial" : "deleted" });
        expect(fake.requests.filter(method => method === "DELETE")).toHaveLength(1);
      }
    });
    it("a replacement identity or changed intent immediately before DELETE never receives the write", async () => {
      for (const replacement of [false, true]) {
        let reads = 0;
        const writes: string[] = [];
        const api = {
          user: async () => ({ id: 1, login: "ada" }),
          request: async <T,>(method: string): Promise<T> => {
            if (method === "DELETE") writes.push(method);
            return { id: ++reads > 1 && replacement ? 43 : 42, permissions: { admin: true } } as T;
          },
        };
        const deletion = new RemoteProjectDeletion();
        await deletion.prepare(api, "ada/notes");
        const result = await deletion.delete(api, "ada/notes", () => replacement);
        expect(result.state).not.toBe("deleted");
        expect(writes).toEqual([]);
      }
    });
  });

  describe("D-400: ephemeral deletion authorization", () => {
    const token = "github_pat_DISPOSABLE0123456789abcdef";
    function options(overrides: Partial<Parameters<typeof withDeletionAuthorization>[0]> = {}) {
      const controller = new AbortController();
      return {
        apiFetch: async () => new Response(JSON.stringify({ id: 1, login: "ada", name: "Ada" }), { status: 200 }),
        oauthFetch: async () => { throw new Error("No OAuth expected"); },
        signal: controller.signal, expected: { id: 1, login: "ada" }, current: () => true, code: () => {},
        ...overrides,
      };
    }
    it("device OAuth asks only delete_repo, polls pending, verifies the account and consumes the token only in its callback", async () => {
      let polls = 0;
      const paths: string[] = [];
      const o = options({
        clientId: "focus-notes-test",
        oauthFetch: async (url, init) => {
          paths.push(new URL(url).pathname);
          const body = new URLSearchParams(String(init?.body));
          expect(body.get("client_id")).toBe("focus-notes-test");
          if (url.endsWith("/code")) {
            expect(body.get("scope")).toBe("delete_repo");
            return new Response(JSON.stringify({ device_code: "ephemeral-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 10, interval: 0.001 }));
          }
          return new Response(JSON.stringify(++polls === 1 ? { error: "authorization_pending" } : { access_token: token, scope: "delete_repo" }));
        },
      });
      expect(await withDeletionAuthorization(o, async api => (await api.user()).id)).toBe(1);
      expect(paths).toEqual(["/login/device/code", "/login/oauth/access_token", "/login/oauth/access_token"]);
    });
    it("declined grant, mismatched account and cancelled intent never enter the destructive callback", async () => {
      let writes = 0;
      const use = async () => ++writes;
      await expect(withDeletionAuthorization(options({ token, expected: { id: 2, login: "other" } }), use)).rejects.toMatchObject({ reason: "identity" });
      await expect(withDeletionAuthorization(options({ token, expected: { id: 1, login: "other" } }), use)).rejects.toMatchObject({ reason: "identity" });
      await expect(withDeletionAuthorization(options({ token, current: () => false }), use)).rejects.toMatchObject({ reason: "declined" });
      const o = options({
        clientId: "focus-notes-test",
        oauthFetch: async url => new Response(JSON.stringify(url.endsWith("/code")
          ? { device_code: "ephemeral-device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 10, interval: 0.001 }
          : { error: "access_denied" })),
      });
      await expect(withDeletionAuthorization(o, use)).rejects.toMatchObject({ reason: "declined" });
      expect(writes).toBe(0);
    });
    it("an unapproved device verification destination never displays a code or polls a grant", async () => {
      const codes: string[] = [];
      const o = options({
        clientId: "focus-notes-test", code: code => codes.push(code),
        oauthFetch: async () => new Response(JSON.stringify({ device_code: "device", user_code: "ABCD-EFGH", verification_uri: "https://untrusted.example/login/device", expires_in: 30, interval: 1 })),
      });
      await expect(withDeletionAuthorization(o, async () => "must not delete")).rejects.toMatchObject({ reason: "failed" });
      expect(codes).toEqual([]);
    });
    it("slow_down increases the protocol polling interval; expiry never invokes deletion", async () => {
      vi.useFakeTimers();
      try {
        const times: number[] = [];
        const o = options({
          clientId: "focus-notes-test",
          oauthFetch: async url => {
            if (url.endsWith("/code")) return new Response(JSON.stringify({ device_code: "device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 30, interval: 1 }));
            times.push(Date.now());
            return new Response(JSON.stringify(times.length === 1 ? { error: "slow_down" } : { access_token: token, scope: "delete_repo" }));
          },
        });
        const operation = withDeletionAuthorization(o, async () => "used");
        await vi.runAllTimersAsync();
        expect(await operation).toBe("used");
        expect(times[1]! - times[0]!).toBe(6000);
        const expiring = options({ clientId: "focus-notes-test", oauthFetch: async () => new Response(JSON.stringify({ device_code: "device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 1, interval: 2 })) });
        await expect(withDeletionAuthorization(expiring, async () => { throw new Error("Must not delete"); })).rejects.toMatchObject({ reason: "expired" });
      } finally { vi.useRealTimers(); }
    });
    it("a repository replaced during the grant is never the subsequent DELETE target", async () => {
      let replacement = false;
      let writes = 0;
      const o = options({
        clientId: "focus-notes-test",
        apiFetch: async (url, init) => {
          if (init?.method === "DELETE") writes++;
          return new Response(JSON.stringify(url.endsWith("/user") ? { id: 1, login: "ada", name: "Ada" } : { id: replacement ? 43 : 42, permissions: { admin: true } }));
        },
        oauthFetch: async url => {
          if (url.endsWith("/code")) return new Response(JSON.stringify({ device_code: "device", user_code: "ABCD-EFGH", verification_uri: "https://github.com/login/device", expires_in: 10, interval: 0.001 }));
          replacement = true;
          return new Response(JSON.stringify({ access_token: token, scope: "delete_repo" }));
        },
      });
      const { GitHubApi } = await import("@focus-notes/github");
      const deletion = new RemoteProjectDeletion();
      await deletion.prepare(new GitHubApi(token, o.apiFetch), "ada/notes");
      expect(await withDeletionAuthorization(o, api => deletion.delete(api, "ada/notes"))).toEqual({ state: "refused", reason: "identity" });
      expect(writes).toBe(0);
    });
    it("without a configured client or supplied token, authorization fails closed instead of using gh's shared keyring", async () => {
      let called = false;
      await expect(withDeletionAuthorization(options(), async () => { called = true; })).rejects.toMatchObject({ reason: "isolation" });
      expect(called).toBe(false);
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
  it("a policy refusal never asks for authorization that cannot override the organization", async () => {
    const api = {
      deletionPermission: "stepup" as const,
      user: async () => ({ id: 1, login: "ada" }),
      request: async <T,>(method: string): Promise<T> => {
        if (method === "DELETE") throw new GitHubError(403, "Organization policy refuses deletion");
        return { id: 42, permissions: { admin: true } } as T;
      },
    };
    const deletion = new RemoteProjectDeletion();
    await deletion.prepare(api, "ada/notes");
    expect(await deletion.delete(api, "ada/notes", () => true, true)).toEqual({ state: "refused", reason: "permission" });
  });
  it("fallback cleanup needs explicit confirmation, unavailable target, and the preflighted account and intent", async () => {
    let unavailable = false;
    let login = "ada";
    const api = {
      user: async () => ({ id: 1, login }),
      request: async <T,>(): Promise<T> => {
        if (unavailable) throw new GitHubError(404, "Not found");
        return { id: 42, permissions: { admin: true } } as T;
      },
    };
    const deletion = new RemoteProjectDeletion();
    await deletion.prepare(api, "ada/notes");
    expect(await deletion.confirmExternal(api, "ada/notes", () => true)).toEqual({ state: "partial" });
    unavailable = true;
    expect(await deletion.delete(api, "ada/notes")).toEqual({ state: "partial" });
    expect(deletion.confirmed("ada/notes")).toBe(false);
    login = "other";
    expect(await deletion.confirmExternal(api, "ada/notes", () => true)).toEqual({ state: "refused", reason: "identity" });
    login = "ada";
    expect(await deletion.confirmExternal(api, "ada/notes", () => false)).toEqual({ state: "refused", reason: "identity" });
    expect(await deletion.confirmExternal(api, "ada/notes", () => true)).toEqual({ state: "deleted" });
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
      expect(await operation).toEqual({ state: "failed", reason: "privateHistory" });
      expect(trash).not.toHaveBeenCalled();
      expect(readFileSync(join(priv, ".git"))).toEqual(pointer);
      expect(readFileSync(join(metadata, "config"))).toEqual(config);
      expect(git(priv, "rev-parse", "HEAD").toString()).toBe(head);
      expect(readFileSync(join(priv, "notes", "Draft.md"), "utf8")).toBe("# Unsaved private draft\n");
      expect((await fsPromises.readdir(join(folder, ".git"))).filter(name => name.startsWith("focus-notes-private-retention-"))).toEqual([]);
    } finally { release(); await operation; copy.mockRestore(); syncBuiltinESMExports(); }
  });
  for (const dependency of ["alternates", "commondir", "registeredWorktree", "configInclude", "worktree", "partialClone", "foreign", "linked"] as const) {
    it(`refuses retained private history with ${dependency} without moving original bytes`, async () => {
      const { root, folder, priv, metadata } = privateSubmodule();
      let sourceMetadata = metadata;
      if (dependency === "alternates") writeFileSync(join(metadata, "objects", "info", "alternates"), join(root, "foreign-objects"));
      else if (dependency === "commondir") writeFileSync(join(metadata, "commondir"), join(root, "foreign-common"));
      else if (dependency === "registeredWorktree") mkdirSync(join(metadata, "worktrees", "other"), { recursive: true });
      else if (dependency === "partialClone") git(priv, "config", "--file", join(metadata, "config"), "remote.origin.promisor", "true");
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
  it("a folder that can't go puts the private notes back and names the file held", async () => {
    const { folder } = project();
    mkdirSync(join(folder, "private"));
    const r = await recycleProject(folder, { keepPrivate: true, trash: async () => { throw new Error("in use"); }, holder: async () => "notes/Ideas.md" });
    expect(r).toEqual({ state: "locked", file: "notes/Ideas.md" });
    expect(existsSync(join(folder, "private"))).toBe(true);
  });
});
