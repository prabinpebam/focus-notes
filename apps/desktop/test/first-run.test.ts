/**
 * The first run's shell side (FRE-02 to FRE-06, SEC-03) with real Git, fake sign-in helpers on PATH
 * (a credential helper, Git Credential Manager, and the GitHub CLI), and the in-memory GitHub:
 * Git and its helpers found; an existing credential and a GitHub CLI session offered (FRE-04);
 * signing in through GCM and the CLI with a device code, and declined, expired, and offline
 * sign-ins; a pasted token checked and handed to Git's helper on standard input; signing out; the
 * identity from GitHub with the private noreply address (FRE-05); and cloning or opening a workspace
 * with or without its private notes (FRE-06). No token appears in any process's arguments.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SignInProgress } from "@focus-notes/core/first-run";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { createRunner } from "../src/main/git/run.ts";
import { Account } from "../src/main/first-run/account.ts";
import { commandFor, createToolRunner, findProgram, isGcmHelper, isGhHelper } from "../src/main/first-run/tools.ts";
import { checkWorkspace, cloneWorkspace, applyLocalIdentity, folderName, homesFor, savedToGitHub, setupTarget } from "../src/main/first-run/workspace.ts";
import { makeFakes, prepareFakes } from "./fakes/fakes.ts";
// One-time setup outside any test's time: a cold runner takes long over its first Git starts (DEF-13).
beforeAll(prepareFakes, 120_000);

const win = process.platform === "win32";

function world(opts: { gcm?: boolean; gh?: boolean; helper?: boolean } = {}) {
  const gh = new FakeGitHub();
  const fakes = makeFakes({ token: gh.token, ...opts });
  const spawned: string[][] = [];
  const progress: SignInProgress[] = [];
  const account = new Account({
    git: createRunner({ env: fakes.env, onSpawn: (args) => spawned.push(["git", ...args]) }),
    tools: createToolRunner({ onSpawn: (program, args) => spawned.push([program, ...args]) }),
    fetch: gh.fetch,
    home: fakes.home,
    env: fakes.env,
    onProgress: (p) => progress.push(p),
  });
  const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, env: fakes.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  /** No token in any argument list: the app's, and every fake's own. */
  const noTokenInArgs = (token = gh.token) => {
    expect(JSON.stringify(spawned)).not.toContain(token);
    expect(fakes.argv()).not.toContain(token);
  };
  return { gh, fakes, account, spawned, progress, git, noTokenInArgs };
}

describe("finding Git's sign-in helpers", () => {
  it("finds programs as the system does, and starts batch shims only with plain words", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-find-"));
    writeFileSync(join(dir, win ? "gh.cmd" : "gh"), "");
    expect(await findProgram("gh", { PATH: dir, PATHEXT: ".EXE;.CMD" })).toBe(join(dir, win ? "gh.cmd" : "gh"));
    expect(await findProgram("missing", { PATH: dir })).toBeUndefined();
    expect(commandFor("C:\\Tools\\gh.cmd", ["auth", "login"], { ComSpec: "cmd.exe" }, true)).toEqual({ file: "cmd.exe", args: ["/d", "/s", "/c", '""C:\\Tools\\gh.cmd" auth login"'], verbatim: true });
    expect(commandFor("/usr/bin/gh", ["auth", "login"], {}, false)).toEqual({ file: "/usr/bin/gh", args: ["auth", "login"], verbatim: false });
    expect(() => commandFor("gh.cmd", ["a&b"], {}, true)).toThrow(/plain word/);
    expect(() => commandFor("gh", ["two words"], {}, false)).toThrow(/plain word/);
  });
  it("recognizes Git Credential Manager and the GitHub CLI as Git's helper", () => {
    for (const h of ["manager", "manager-core", "/usr/local/share/gcm-core/git-credential-manager", "C:/Program\\ Files/Git/mingw64/bin/git-credential-manager.exe"]) expect(isGcmHelper(h)).toBe(true);
    for (const h of ["osxkeychain", "store", "!gh auth git-credential", "libsecret"]) expect(isGcmHelper(h)).toBe(false);
    expect(isGhHelper("!/usr/bin/gh auth git-credential")).toBe(true);
    expect(isGhHelper("!'C:\\Program Files\\GitHub CLI\\gh.exe' auth git-credential")).toBe(true);
    expect(isGhHelper("manager")).toBe(false);
  });
});

describe("FRE-01: the Git step", () => {
  it("reports Git's version and which helpers can sign in", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true, gh: true });
    const g = await w.account.gitCheck();
    expect(g).toMatchObject({ installed: true, ok: true, gcm: true, gh: true });
    expect(g.version).toMatch(/^2\.\d+\.\d+$/);
    const plain = world({});
    expect(await plain.account.gitCheck()).toMatchObject({ installed: true, gcm: false, gh: false });
  });
});

describe("FRE-02 to FRE-04: signing in through Git's helpers", () => {
  it("FRE-04: an existing working credential is found and checked with the API, with no sign-in", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    const s = await w.account.status();
    expect(s).toMatchObject({ account: { login: "ada", id: 583231 }, gcm: true });
    expect(w.spawned.some((a) => a.includes("login"))).toBe(false);
    w.noTokenInArgs();
  });
  it("a credential GitHub refuses isn't offered; a GitHub CLI session is, and Continue makes Git use it", { timeout: 30_000 }, async () => {
    const w = world({ gh: true });
    w.fakes.store("ghp_REVOKED000000000000000000000000000000");
    w.fakes.session(w.gh.token);
    const s = await w.account.status();
    expect(s.account).toBeUndefined();
    expect(s.cliAccount).toMatchObject({ login: "ada" });
    const used = await w.account.useExisting();
    expect(used.account).toMatchObject({ login: "ada" });
    expect(w.fakes.argv()).toContain('["gh","auth","setup-git","--hostname","github.com"]');
    w.noTokenInArgs();
  });
  it("FRE-02: GCM with a device code shows the code, then Git has the credential", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    const s = await w.account.signIn(true);
    expect(w.progress).toContainEqual({ phase: "code", code: "ABCD-1234", helper: "gcm" });
    expect(s.account).toMatchObject({ login: "ada" });
    expect(w.fakes.argv()).toContain('["gcm","github","login","--device"]');
    // FRE-03: the credential is in Git's helper, where the terminal's git finds it too.
    const fill = execFileSync("git", ["credential", "fill"], { cwd: w.fakes.home, env: { ...w.fakes.env, GIT_TERMINAL_PROMPT: "0" }, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
    expect(fill.includes(`=${w.gh.token}`)).toBe(true);
    w.noTokenInArgs();
  });
  it("FRE-02: the GitHub CLI's one-time code is shown in the app, and Git is set up to use the CLI", { timeout: 30_000 }, async () => {
    const w = world({ gh: true });
    const s = await w.account.signIn(true);
    expect(w.progress).toContainEqual({ phase: "code", code: "WDJB-MJHT", helper: "gh" });
    expect(s.account).toMatchObject({ login: "ada" });
    expect(w.fakes.argv()).toContain('["gh","auth","login","--web","--hostname","github.com","--git-protocol","https","--scopes","workflow"]');
    w.noTokenInArgs();
  });
  it("FRE-02: declined, expired, and offline say why, and the next try works", { timeout: 60_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.outcomes(["declined", "expired", "offline"]);
    expect((await w.account.signIn(false)).problem).toBe("declined");
    expect((await w.account.signIn(true)).problem).toBe("expired");
    expect((await w.account.signIn(true)).problem).toBe("offline");
    expect((await w.account.signIn(true)).account).toMatchObject({ login: "ada" });
    // GitHub unreachable with a credential in Git: offline, not signed out.
    w.gh.offline = true;
    expect(await w.account.status()).toMatchObject({ problem: "offline" });
  });
  it("cancelling stops the helper", { timeout: 30_000 }, async () => {
    const w = world({ gh: true });
    writeFileSync(join(w.fakes.root, "config.json"), JSON.stringify({ token: w.gh.token, login: "ada", delayMs: 20_000 }));
    const going = w.account.signIn(true);
    await new Promise((r) => setTimeout(r, 1500));
    w.account.cancel();
    const s = await going;
    expect(s.account).toBeUndefined();
  });
  it("no helper that can sign in: noHelper", { timeout: 30_000 }, async () => {
    const w = world({});
    expect(await w.account.signIn(true)).toMatchObject({ problem: "noHelper", gcm: false, gh: false });
  });
  it("FRE-03, SEC-03: a pasted token is checked with the API, then given to Git's helper on standard input only", { timeout: 30_000 }, async () => {
    const w = world({});
    expect((await w.account.useToken("ghp_WRONG0000000000000000000000000000000")).problem).toBe("invalid");
    expect(w.fakes.stored()).toBe("");
    const s = await w.account.useToken(`  ${w.gh.token}\n`);
    expect(s.account).toMatchObject({ login: "ada" });
    expect(JSON.parse(w.fakes.stored())).toEqual({ "github.com": { username: "ada", password: w.gh.token } });
    // The API got it only in the Authorization header, never in an address.
    expect(w.gh.raw.every((r) => !r.url.includes(w.gh.token))).toBe(true);
    w.noTokenInArgs();
  });
  it("a token with no credential helper to keep it is refused, and nothing is kept", { timeout: 30_000 }, async () => {
    const w = world({ helper: false });
    expect((await w.account.useToken(w.gh.token)).problem).toBe("noHelper");
    expect((await w.account.status()).account).toBeUndefined();
  });
  it("FRE-07: signing out removes the credential from Git's helper, so the terminal is signed out too", { timeout: 30_000 }, async () => {
    const w = world({ gh: true });
    w.fakes.store(w.gh.token);
    expect((await w.account.status()).account).toBeDefined();
    const out = await w.account.signOut();
    expect(out.account).toBeUndefined();
    expect(w.fakes.stored()).toBe("{}");
    w.noTokenInArgs();
  });
});

describe("FRE-05: the identity", () => {
  it("is filled in from GitHub with the private noreply address when Git has none, and saved to Git's settings", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    expect(await w.account.identity()).toEqual({ name: "Ada", email: "583231+ada@users.noreply.github.com", source: "github" });
    expect(await w.account.setGlobalIdentity({ name: "Ada", email: "583231+ada@users.noreply.github.com" })).toBe(true);
    expect(w.git(w.fakes.home, "config", "--global", "user.email")).toBe("583231+ada@users.noreply.github.com");
    expect(await w.account.identity()).toMatchObject({ source: "git", name: "Ada" });
  });
});

describe("FRE-06: opening a workspace from GitHub or this computer", () => {
  /** A workspace's two remotes, as GitHub would have them after setup. */
  function remotes(w: ReturnType<typeof world>) {
    const root = mkdtempSync(join(tmpdir(), "fn-ws-"));
    const notes = join(root, "remotes", "ada", "notes.git"), priv = join(root, "remotes", "ada", "notes-private.git");
    for (const r of [notes, priv]) {
      mkdirSync(r, { recursive: true });
      w.git(r, "init", "--quiet", "--bare", "--initial-branch=main");
    }
    const seedP = join(root, "seed-p");
    w.git(root, "clone", "--quiet", priv, seedP);
    mkdirSync(join(seedP, "notes"));
    writeFileSync(join(seedP, "notes", "secret.md"), "# Secret\n");
    w.git(seedP, "-c", "user.name=A", "-c", "user.email=a@b.c", "add", "-A");
    w.git(seedP, "-c", "user.name=A", "-c", "user.email=a@b.c", "commit", "--quiet", "-m", "Start");
    w.git(seedP, "push", "--quiet", "origin", "main");
    const seedN = join(root, "seed-n");
    w.git(root, "clone", "--quiet", notes, seedN);
    mkdirSync(join(seedN, ".focus-notes"));
    writeFileSync(join(seedN, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
    w.git(seedN, "submodule", "add", "--quiet", "-b", "main", priv.replace(/\\/g, "/"), "private");
    w.git(seedN, "-c", "user.name=A", "-c", "user.email=a@b.c", "add", "-A");
    w.git(seedN, "-c", "user.name=A", "-c", "user.email=a@b.c", "commit", "--quiet", "-m", "Start");
    w.git(seedN, "push", "--quiet", "origin", "main");
    return { root, notes, priv };
  }
  const runner = (w: ReturnType<typeof world>) => createRunner({ env: w.fakes.env, onSpawn: (args) => w.spawned.push(["git", ...args]) });

  it("clones with the private notes, on main, with pushes checking the submodule", { timeout: 60_000 }, async () => {
    const w = world({});
    const r = remotes(w);
    const folder = join(r.root, "Documents", "Focus Notes");
    const res = await cloneWorkspace(runner(w), r.notes, folder);
    expect(res).toEqual({ ok: true, folder, privateNotes: true });
    expect(existsSync(join(folder, "private", "notes", "secret.md"))).toBe(true);
    expect(w.git(join(folder, "private"), "symbolic-ref", "--short", "HEAD")).toBe("main");
    expect(w.git(folder, "config", "push.recurseSubmodules")).toBe("check");
    // A workspace-only identity goes into both repositories' own settings.
    await applyLocalIdentity(runner(w), folder, { name: "Ada", email: "583231+ada@users.noreply.github.com" });
    expect(w.git(join(folder, "private"), "config", "--local", "user.email")).toBe("583231+ada@users.noreply.github.com");
  });
  it("FRE-06: without access to the private repository the clone finishes with public notes only", { timeout: 60_000 }, async () => {
    const w = world({});
    const r = remotes(w);
    execFileSync(process.execPath, ["-e", `require("fs").renameSync(${JSON.stringify(r.priv)}, ${JSON.stringify(r.priv + ".gone")})`]);
    const folder = join(r.root, "clone");
    expect(await cloneWorkspace(runner(w), r.notes, folder)).toEqual({ ok: true, folder, privateNotes: false });
    expect(existsSync(join(folder, ".focus-notes", "workspace.json"))).toBe(true);
  });
  it("refuses a folder with other files, a repository that isn't a workspace, and a folder that isn't a clone's top", { timeout: 60_000 }, async () => {
    const w = world({});
    const r = remotes(w);
    const taken = join(r.root, "taken");
    mkdirSync(taken);
    writeFileSync(join(taken, "a.txt"), "a");
    expect(await cloneWorkspace(runner(w), r.notes, taken)).toEqual({ ok: false, problem: "folderTaken" });
    const fresh = join(r.root, "fresh");
    expect(await cloneWorkspace(runner(w), r.priv, fresh)).toEqual({ ok: false, problem: "notWorkspace" });
    expect(existsSync(fresh)).toBe(false);
    expect(await cloneWorkspace(runner(w), join(r.root, "nowhere.git"), join(r.root, "x"))).toMatchObject({ ok: false });
    expect(await checkWorkspace(runner(w), join(r.root, "seed-n", ".focus-notes"))).toEqual({ ok: false, problem: "notGit" });
    expect(await checkWorkspace(runner(w), join(r.root, "seed-p"))).toEqual({ ok: false, problem: "notWorkspace" });
    expect(await checkWorkspace(runner(w), join(r.root, "seed-n"))).toMatchObject({ ok: true, privateNotes: true });
    expect(readdirSync(taken)).toEqual(["a.txt"]);
  });
  // D-155: the folder is named after the repository; names Windows can't use as a folder are adjusted.
  it("folder names: the repository's name, safe on Windows, with free names beside it", () => {
    expect(folderName("prabins-notes")).toBe("prabins-notes");
    expect(folderName("notes")).toBe("notes");
    expect(folderName(".notes")).toBe(".notes");
    expect(folderName("notes.")).toBe("notes");
    expect(folderName("notes...")).toBe("notes");
    expect(folderName("...")).toBe("notes");
    for (const r of ["con", "CON", "prn", "aux", "nul", "com1", "lpt9", "con.notes", "Nul.txt"]) expect(folderName(r), r).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i);
    expect(folderName("con")).toBe("con-notes");
    expect(folderName("con.notes")).toBe("con-notes.notes");
    expect(folderName("console")).toBe("console");
    const list = homesFor(join("D:", "Docs"), "prabins-notes");
    expect(list.slice(0, 3)).toEqual([join("D:", "Docs", "prabins-notes"), join("D:", "Docs", "prabins-notes 2"), join("D:", "Docs", "prabins-notes 3")]);
    expect(list).toHaveLength(99);
  });  // D-124, D-154 (the owner's dead end): Run setup again from a folder used on this computer only.
  it("setup's folder: never a folder used on this computer only; the open clone, a chosen folder, or the one it started with", { timeout: 60_000 }, async () => {
    const w = world({});
    const r = remotes(w);
    const local = join(r.root, "Documents", "Focus Notes 2");
    mkdirSync(join(local, ".focus-notes"), { recursive: true });
    writeFileSync(join(local, ".focus-notes", "workspace.json"), '{ "formatVersion": 1 }\n');
    writeFileSync(join(local, "Draft.md"), "# Draft\n");
    const clone = join(r.root, "Documents", "Focus Notes");
    await cloneWorkspace(runner(w), r.notes, clone);
    expect(await savedToGitHub(runner(w), local)).toBe(false);
    expect(await savedToGitHub(runner(w), clone)).toBe(true);
    expect(await savedToGitHub(runner(w), join(r.root, "missing"))).toBe(false);
    // A folder used on this computer only stays where it is: the app picks a free folder beside it.
    expect(setupTarget({ open: { folder: local, savedToGitHub: false } })).toEqual({ chosen: false });
    expect(setupTarget({})).toEqual({ chosen: false });
    expect(setupTarget({ open: { folder: clone, savedToGitHub: true } })).toEqual({ folder: clone, chosen: true });
    expect(setupTarget({ picked: "/p", open: { folder: clone, savedToGitHub: true } })).toEqual({ folder: "/p", chosen: true });
    expect(setupTarget({ started: { folder: local }, picked: "/p" })).toEqual({ folder: local, chosen: false });
    expect(setupTarget({ started: { folder: "/p", chosen: true } })).toEqual({ folder: "/p", chosen: true });
  });
  it("D-157: never clones or opens a template repository, whatever route", { timeout: 60_000 }, async () => {
    const w = world({});
    const r = remotes(w);
    const isTemplate = async (url: string) => url.replace(/\\/g, "/") === r.notes.replace(/\\/g, "/");
    const folder = join(r.root, "from-github");
    expect(await cloneWorkspace(runner(w), r.notes, folder, isTemplate)).toEqual({ ok: false, problem: "template" });
    expect(existsSync(folder), "nothing downloaded").toBe(false);
    // A folder already cloned from a template (Open a folder on this computer, or switching to it).
    expect(await checkWorkspace(runner(w), join(r.root, "seed-n"), isTemplate)).toEqual({ ok: false, problem: "template" });
    // Not a template: both go on as before.
    expect(await checkWorkspace(runner(w), join(r.root, "seed-n"), async () => false)).toMatchObject({ ok: true });
    // MEDIUM-3: any of origin's push URLs, not only the first.
    const seed = join(r.root, "seed-n");
    const elsewhere = join(r.root, "elsewhere.git");
    w.git(seed, "remote", "set-url", "--add", "--push", "origin", elsewhere);
    w.git(seed, "remote", "set-url", "--add", "--push", "origin", r.notes);
    const asked: string[] = [];
    expect(await checkWorkspace(runner(w), seed, async (url) => (asked.push(url), isTemplate(url)))).toEqual({ ok: false, problem: "template" });
    expect(asked).toHaveLength(2);
  });
});
