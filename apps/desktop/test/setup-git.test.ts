/**
 * Set up my instance (FRE-08) end to end, with real Git against local bare remotes and the
 * in-memory GitHub: the template copied (from templates/workspace/), the private repository made,
 * cloned, linked at `private/` on `main`, the vault's grant written with only the derived key and
 * valid against its schema, both pushed private first, and Pages on. Then a push that fails and is
 * retried alone, a quit mid-step that resumes, and no token or passphrase in any Git argument,
 * environment, log, or saved file (SEC-03). No request leaves the computer.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { derivePasscodeBits, fromB64url, toB64url } from "@focus-notes/seal";
import { FakeGitHub, type FakeRepo } from "../../../packages/github/test/fake-github.ts";
import { SetupEngine, SECRET_NAME } from "../src/main/setup/engine.ts";
import { createRunner } from "../src/main/git/run.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const PASSPHRASE = "quiet maple lantern orbit seven";
const IDENTITY = { GIT_AUTHOR_NAME: "Ada", GIT_AUTHOR_EMAIL: "ada@example.com", GIT_COMMITTER_NAME: "Ada", GIT_COMMITTER_EMAIL: "ada@example.com" };
// Local remotes need file transport for the submodule; nothing here signs commits.
const CONFIG = { GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "protocol.file.allow", GIT_CONFIG_VALUE_0: "always", GIT_CONFIG_KEY_1: "commit.gpgsign", GIT_CONFIG_VALUE_1: "false", GIT_CONFIG_KEY_2: "core.autocrlf", GIT_CONFIG_VALUE_2: "false" };
const env = { ...process.env, ...IDENTITY, ...CONFIG, GIT_TERMINAL_PROMPT: "0" };
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }).trim();
const slash = (p: string) => p.replace(/\\/g, "/");

/** Files under a folder, `.git` included, as text, for searching for things that must never be there. */
const everything = (dir: string): string => readdirSync(dir).map((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? everything(p) : readFileSync(p, "latin1");
}).join("\n");

function world() {
  const root = mkdtempSync(join(tmpdir(), "fn-setup-git-"));
  const remotes = join(root, "remotes");
  const remote = (owner: string, name: string) => slash(join(remotes, owner, `${name}.git`));
  const gh = new FakeGitHub();
  // GitHub makes a repository's Git remote: the template's content for a copy, a README for a new one.
  gh.onCreate = (r: FakeRepo) => {
    const bare = remote(r.owner, r.name);
    mkdirSync(bare, { recursive: true });
    git(bare, "init", "--quiet", "--bare", "--initial-branch=main");
    const seed = mkdtempSync(join(root, "seed-"));
    if (r.template) cpSync(join(repoRoot, "templates", "workspace"), seed, { recursive: true });
    else writeFileSync(join(seed, "README.md"), `# ${r.name}\n`);
    git(seed, "init", "--quiet", "--initial-branch=main");
    git(seed, "add", "-A");
    git(seed, "commit", "--quiet", "-m", "Initial commit");
    git(seed, "push", "--quiet", bare, "main");
  };
  const spawned: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
  const logs: string[] = [];
  const progressFile = join(root, "userData", "setup.json");
  const folder = join(root, "Documents", "Focus Notes");
  const deps = {
    git: createRunner({ env, onSpawn: (args, e) => spawned.push({ args, env: e }) }),
    progressFile,
    token: async () => gh.token,
    fetch: gh.fetch,
    remoteUrl: remote,
    sleep: async () => {},
    log: (l: string) => logs.push(l),
  };
  return { root, gh, remote, spawned, logs, progressFile, folder, open: (more: { folders?: (instance: string) => string[] } = {}) => SetupEngine.open({ ...deps, ...more }) };
}

describe("FRE-08: Create my workspace, with real Git", () => {
  it("leaves two repositories, a linked submodule on main, the deploy key and secret, the vault's derived key, and Pages", { timeout: 120_000 }, async () => {
    const w = world();
    const engine = await w.open();
    const options = { instance: "notes", private: "notes-private", folder: w.folder, publish: true };
    const report = await engine.start(options, PASSPHRASE);
    expect(report.steps.map((s) => `${s.id}:${s.state}`)).toEqual(["account", "instance", "private", "deployKey", "clone", "link", "vault", "pages", "push"].map((s) => `${s}:done`));
    expect(report.site).toBe("https://ada.github.io/notes/");

    // GitHub: the instance from the template, the private repository, the read-only key, the secret, and Pages.
    const notes = w.gh.repo("notes")!, priv = w.gh.repo("notes-private")!;
    expect(notes).toMatchObject({ private: false, template: "prabinpebam/focus-notes-workspace", pages: { build_type: "workflow" } });
    expect(priv.private).toBe(true);
    expect(priv.keys).toEqual([expect.objectContaining({ read_only: true })]);
    expect(w.gh.openSecret(notes, SECRET_NAME)).toMatch(/^-----BEGIN OPENSSH PRIVATE KEY-----/);

    // The clone: private/ is a submodule tracking main, checked out on main, with pushes checked.
    const ws = w.folder, p = join(ws, "private");
    expect(git(ws, "config", "--file", ".gitmodules", "--get", "submodule.private.url")).toBe(w.remote("ada", "notes-private"));
    expect(git(ws, "config", "--file", ".gitmodules", "--get", "submodule.private.branch")).toBe("main");
    expect(git(ws, "config", "--get", "push.recurseSubmodules")).toBe("check");
    expect(git(p, "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(existsSync(join(ws, ".focus-notes", "workspace.json"))).toBe(true);
    expect(existsSync(join(p, "notes", ".gitkeep"))).toBe(true);

    // The vault: only the derived key, valid against the schema, and it's the passphrase's.
    const access = JSON.parse(readFileSync(join(p, "access.json"), "utf8"));
    const ajv = new Ajv2020({ strict: false });
    addFormats(ajv);
    expect(ajv.validate(JSON.parse(readFileSync(join(repoRoot, "schemas", "access.schema.json"), "utf8")), access)).toBe(true);
    expect(access.grants).toHaveLength(1);
    const grant = access.grants[0];
    expect(Object.keys(grant).sort()).toEqual(["createdAt", "id", "name", "owner", "passcodeKey", "salt", "scope"]);
    expect(grant).toMatchObject({ name: "You", owner: true, scope: { all: true } });
    expect(grant.passcodeKey).toBe(toB64url(await derivePasscodeBits(PASSPHRASE, fromB64url(grant.salt))));

    // Pushed, private first: the instance's pointer is the private remote's main, which has the grant.
    const privateMain = git(w.remote("ada", "notes-private"), "rev-parse", "main");
    expect(git(w.remote("ada", "notes"), "ls-tree", "main", "private")).toContain(`commit ${privateMain}`);
    expect(git(w.remote("ada", "notes-private"), "ls-tree", "--name-only", "main")).toMatch(/access\.json/);
    expect(git(w.remote("ada", "notes"), "log", "-1", "--format=%s", "main")).toMatch(/^(Update private notes to [0-9a-f]{7}|Link private notes)$/);
    expect(git(ws, "status", "--porcelain")).toBe("");

    // SEC-03: no token or passphrase in any argument, environment, log, saved progress, or file of the workspace.
    const seen = JSON.stringify(w.spawned) + w.logs.join("\n") + readFileSync(w.progressFile, "utf8") + JSON.stringify(report);
    for (const secret of [w.gh.token, PASSPHRASE]) {
      expect(seen).not.toContain(secret);
      expect(everything(ws)).not.toContain(secret);
    }
    expect(w.spawned.every(({ env: e }) => e.GIT_TERMINAL_PROMPT === "0" && e.GCM_INTERACTIVE === "never")).toBe(true);

    // Done steps aren't repeated: a second start calls nothing and runs no Git.
    const calls = w.gh.calls.length, spawns = w.spawned.length;
    const again = await (await w.open()).start(options);
    expect(again.steps.every((s) => s.state === "done")).toBe(true);
    expect(w.gh.calls.length).toBe(calls);
    expect(w.spawned.length).toBe(spawns);
  });

  it("a push that fails is retried alone; a quit mid-step resumes; the Git steps are idempotent", { timeout: 120_000 }, async () => {
    const w = world();
    const options = { instance: "notes", private: "notes-private", folder: w.folder, publish: false };
    const engine = await w.open();
    // The instance's remote is unreachable for the first push.
    const away = `${w.remote("ada", "notes")}.away`;
    const first = await engine.start(options);
    expect(first.steps.find((s) => s.id === "vault")!.state).toBe("skipped");
    expect(first.steps.find((s) => s.id === "pages")!.state).toBe("skipped");
    expect(first.steps.find((s) => s.id === "push")!.state).toBe("done");

    // Make the next push fail, then retry just that step.
    writeFileSync(join(w.folder, "notes", "hello.md"), "# Hello\n");
    git(w.folder, "add", "-A");
    git(w.folder, "commit", "--quiet", "-m", "Create notes/hello.md");
    const progress = JSON.parse(readFileSync(w.progressFile, "utf8"));
    progress.steps.push = { state: "pending" };
    writeFileSync(w.progressFile, JSON.stringify(progress));
    renameSync(w.remote("ada", "notes"), away);
    const failing = await w.open();
    const failed = await failing.start(options);
    expect(failed.steps.find((s) => s.id === "push")).toMatchObject({ state: "failed", problem: "offline" });
    renameSync(away, w.remote("ada", "notes"));
    const calls = w.gh.calls.length;
    const retried = await failing.retry("push");
    expect(retried.steps.find((s) => s.id === "push")!.state).toBe("done");
    expect(w.gh.calls.length).toBe(calls);
    expect(git(w.remote("ada", "notes"), "log", "-1", "--format=%s", "main")).toBe("Create notes/hello.md");

    // Skip for now, then the vault later: retrying the skipped step with a passphrase writes the grant.
    const vault = await failing.retry("vault", PASSPHRASE);
    expect(vault.steps.find((s) => s.id === "vault")!.state).toBe("done");
    expect(git(join(w.folder, "private"), "log", "-1", "--format=%s")).toBe("Add the vault's key");

    // Quit while link, vault, and push were running: they run again, change nothing, and push what's left.
    const countPrivate = () => Number(git(join(w.folder, "private"), "rev-list", "--count", "HEAD"));
    const before = { notes: Number(git(w.folder, "rev-list", "--count", "HEAD")), priv: countPrivate() };
    const saved = JSON.parse(readFileSync(w.progressFile, "utf8"));
    for (const id of ["link", "vault", "push"]) saved.steps[id] = { state: "running" };
    writeFileSync(w.progressFile, JSON.stringify(saved));
    const resumed = await (await w.open()).start(options);
    expect(resumed.steps.every((s) => s.state === "done" || s.state === "skipped")).toBe(true);
    expect(countPrivate()).toBe(before.priv);
    // The vault's commit moved the pointer once, and both remotes have everything.
    expect(Number(git(w.folder, "rev-list", "--count", "HEAD"))).toBe(before.notes + 1);
    expect(git(w.folder, "log", "-1", "--format=%s")).toMatch(/^Update private notes to [0-9a-f]{7}$/);
    expect(git(w.remote("ada", "notes-private"), "rev-parse", "main")).toBe(git(join(w.folder, "private"), "rev-parse", "HEAD"));
    expect(git(w.remote("ada", "notes"), "rev-parse", "main")).toBe(git(w.folder, "rev-parse", "HEAD"));
  });

  it("never clones into a folder the person chose that has other files, or a clone of something else", { timeout: 60_000 }, async () => {
    const w = world();
    mkdirSync(w.folder, { recursive: true });
    writeFileSync(join(w.folder, "Welcome.md"), "# Welcome\n");
    const r = await (await w.open({ folders: () => [`${w.folder} 2`] })).start({ instance: "notes", private: "notes-private", folder: w.folder, chosen: true, publish: false });
    expect(r.steps.find((s) => s.id === "clone")).toMatchObject({ state: "failed", problem: "folderTaken" });
    expect(readdirSync(w.folder)).toEqual(["Welcome.md"]);
    expect(existsSync(`${w.folder} 2`)).toBe(false);
  });

  // D-154, D-155: a folder the app chooses is decided when Download runs, from the repository's name:
  // Documents/<name>, or the next free "<name> 2" beside it. The folder setup started with doesn't hold it.
  it("a folder the app chose: Documents/<instance name> when Download runs, the next free one when taken, recorded", { timeout: 60_000 }, async () => {
    const w = world();
    const docs = join(w.root, "Documents");
    const named = join(docs, "prabins-notes");
    mkdirSync(named, { recursive: true });
    writeFileSync(join(named, "Welcome.md"), "# Welcome\n");
    const asked: string[] = [];
    const engine = await w.open({ folders: (name: string) => (asked.push(name), [join(docs, name), join(docs, `${name} 2`)]) });
    const r = await engine.start({ instance: "prabins-notes", private: "prabins-notes-private", folder: w.folder, publish: false });
    expect(r.steps.every((s) => s.state === "done" || s.state === "skipped")).toBe(true);
    expect(asked).toEqual(["prabins-notes"]);
    const next = `${named} 2`;
    expect(r.options?.folder).toBe(next);
    expect(JSON.parse(readFileSync(w.progressFile, "utf8")).options.folder).toBe(next);
    expect(readdirSync(named)).toEqual(["Welcome.md"]);
    expect(existsSync(w.folder)).toBe(false);
    expect(existsSync(join(next, ".focus-notes", "workspace.json"))).toBe(true);
  });
  it("a folder that's already this clone is resumed, never swapped for another", { timeout: 60_000 }, async () => {
    const w = world();
    const first = await (await w.open()).start({ instance: "notes", private: "notes-private", folder: w.folder, publish: false });
    expect(first.steps.find((s) => s.id === "clone")?.state).toBe("done");
    const engine = await w.open({ folders: () => { throw new Error("not asked"); } });
    await engine.reset();
    const again = await engine.start({ instance: "notes", private: "notes-private", folder: w.folder, publish: false });
    expect(again.steps.find((s) => s.id === "clone")?.state).toBe("done");
    expect(again.options?.folder).toBe(w.folder);
  });

  // D-154: a folder the person chose that's taken: Choose another folder… or Use a new folder, then Download runs there.
  it("useFolder moves a failed Download to another folder, and only before Download is done", { timeout: 60_000 }, async () => {
    const w = world();
    mkdirSync(w.folder, { recursive: true });
    writeFileSync(join(w.folder, "Welcome.md"), "# Welcome\n");
    const engine = await w.open();
    const failed = await engine.start({ instance: "notes", private: "notes-private", folder: w.folder, chosen: true, publish: false });
    expect(failed.steps.find((s) => s.id === "clone")).toMatchObject({ state: "failed", problem: "folderTaken" });
    const other = join(w.root, "Elsewhere", "Notes");
    const moved = await engine.useFolder(other, true);
    expect(moved.options).toMatchObject({ folder: other, chosen: true });
    expect(moved.steps.find((s) => s.id === "clone")?.state).toBe("pending");
    await expect(engine.useFolder("relative/path", true)).rejects.toThrow();
    const r = await engine.retry("clone");
    expect(r.steps.find((s) => s.id === "clone")?.state).toBe("done");
    expect(existsSync(join(other, ".git"))).toBe(true);
    await expect(engine.useFolder(join(w.root, "Third"), false)).rejects.toThrow(/already/);
  });
});
