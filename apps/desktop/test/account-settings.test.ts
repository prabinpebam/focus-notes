/**
 * Settings → Account and Workspace on the desktop (FRE-07, PRV-02) with real Git, fake sign-in
 * helpers on PATH, and the in-memory GitHub: signing out with and without removing Git's saved
 * credential, switching account through the same helper (and keeping the old one when the switch
 * is abandoned), deleting exactly what the data inventory lists, and removing a workspace's local
 * clone only once everything in both repositories is on the remote.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_FILES, filesRemovedBy } from "@focus-notes/core/inventory";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { createRunner } from "../src/main/git/run.ts";
import { Account } from "../src/main/first-run/account.ts";
import { createToolRunner } from "../src/main/first-run/tools.ts";
import { forgetLocalData, removalCheck, removeWorkspace } from "../src/main/workspace/remove.ts";
import { makeFakes } from "./fakes/fakes.ts";
import { count, git, instance, write } from "./git-fixture.ts";

const GRACE_TOKEN = "ghp_GRACE0123456789abcdefTOKEN00";

function world(opts: { gcm?: boolean; gh?: boolean } = {}) {
  const gh = new FakeGitHub();
  gh.addAccount(GRACE_TOKEN, { login: "grace", id: 99, name: "Grace" });
  const fakes = makeFakes({ token: gh.token, ...opts });
  const userData = mkdtempSync(join(tmpdir(), "fn-user-"));
  const spawned: string[][] = [];
  const account = new Account({
    git: createRunner({ env: fakes.env, onSpawn: (args) => spawned.push(["git", ...args]) }),
    tools: createToolRunner({ onSpawn: (program, args) => spawned.push([program, ...args]) }),
    fetch: gh.fetch,
    home: fakes.home,
    env: fakes.env,
    signedOutFile: join(userData, DATA_FILES.account),
  });
  /** What the terminal's Git gets for github.com, with prompts off: the password, or nothing. */
  const terminal = () => {
    const r = spawnSync("git", ["credential", "fill"], { cwd: fakes.home, env: { ...fakes.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" }, input: "protocol=https\nhost=github.com\n\n", encoding: "utf8" });
    return r.status === 0 ? /password=(.*)/.exec(r.stdout)?.[1] : undefined;
  };
  const noTokenInArgs = () => {
    for (const t of [gh.token, GRACE_TOKEN]) {
      expect(JSON.stringify(spawned)).not.toContain(t);
      expect(fakes.argv()).not.toContain(t);
    }
  };
  return { gh, fakes, account, userData, terminal, noTokenInArgs };
}

describe("FRE-07: signing out", () => {
  it("with Git's credential removed: the terminal is signed out too, and nothing is kept", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    expect((await w.account.status()).account).toMatchObject({ login: "ada" });
    expect(w.terminal()).toBe(w.gh.token);
    const out = await w.account.signOut({ git: true });
    expect(out.account).toBeUndefined();
    expect(w.terminal()).toBeUndefined();
    expect(existsSync(join(w.userData, DATA_FILES.account))).toBe(false);
    expect(await w.account.api()).toBeUndefined();
    w.noTokenInArgs();
  });
  it("keeping Git's credential: the terminal still works, Focus Notes is signed out until Continue as @login", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    await w.account.status();
    const out = await w.account.signOut({ git: false });
    expect(out).toMatchObject({ account: { login: "ada" }, signedOut: true, via: "gcm" });
    expect(w.terminal()).toBe(w.gh.token);
    // Remembered across restarts, holding no token or login.
    expect(readdirSync(w.userData)).toEqual([DATA_FILES.account]);
    const again = new Account({ git: createRunner({ env: w.fakes.env }), tools: createToolRunner({}), fetch: w.gh.fetch, home: w.fakes.home, env: w.fakes.env, signedOutFile: join(w.userData, DATA_FILES.account) });
    expect(await again.status()).toMatchObject({ signedOut: true });
    expect(await again.api()).toBeUndefined();
    expect(await again.token()).toBeUndefined();
    // Continue as @ada signs Focus Notes in again (FRE-04), and forgets the mark.
    const back = await again.useExisting();
    expect(back.account).toMatchObject({ login: "ada" });
    expect(back.signedOut).toBeUndefined();
    expect(existsSync(join(w.userData, DATA_FILES.account))).toBe(false);
    expect((await again.api())?.account.login).toBe("ada");
    w.noTokenInArgs();
  });
  it("says which helper holds the credential: GCM, the GitHub CLI, or another of Git's helpers", { timeout: 30_000 }, async () => {
    const gcm = world({ gcm: true });
    gcm.fakes.store(gcm.gh.token);
    expect((await gcm.account.status()).via).toBe("gcm");
    const plain = world({});
    plain.fakes.store(plain.gh.token);
    expect((await plain.account.status()).via).toBe("helper");
  });
});

describe("FRE-07: switching account", () => {
  it("signs in again through the same helper as another account, which Git then uses", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    await w.account.status();
    const begun = await w.account.beginSwitch();
    expect(begun.account).toBeUndefined();
    w.fakes.signInAs(GRACE_TOKEN, "grace");
    const s = await w.account.signIn(true);
    expect(s.account).toMatchObject({ login: "grace" });
    const end = await w.account.endSwitch();
    expect(end.account).toMatchObject({ login: "grace" });
    expect(w.terminal()).toBe(GRACE_TOKEN);
    w.noTokenInArgs();
  });
  it("an abandoned switch puts the old sign-in back", { timeout: 30_000 }, async () => {
    const w = world({ gcm: true });
    w.fakes.store(w.gh.token);
    await w.account.status();
    await w.account.beginSwitch();
    expect(w.terminal()).toBeUndefined();
    w.fakes.outcomes(["declined"]);
    expect((await w.account.signIn(false)).problem).toBe("declined");
    const end = await w.account.endSwitch();
    expect(end.account).toMatchObject({ login: "ada" });
    expect(w.terminal()).toBe(w.gh.token);
    w.noTokenInArgs();
  });
});

describe("PRV-02: what signing out and removing a workspace delete", () => {
  it("deletes exactly the inventory's files for each event, and nothing else in the data folder", async () => {
    for (const event of ["signOut", "removeWorkspace", "runSetupAgain"] as const) {
      const dir = mkdtempSync(join(tmpdir(), "fn-user-"));
      for (const f of Object.values(DATA_FILES)) writeFileSync(join(dir, f), "{}");
      mkdirSync(join(dir, "Chromium"));
      await forgetLocalData(dir, event);
      const left = readdirSync(dir).sort();
      const expected = [...Object.values(DATA_FILES).filter((f) => !filesRemovedBy(event).includes(f)), "Chromium"].sort();
      expect(left, event).toEqual(expected);
    }
  });
});

describe("FRE-07, PRV-02: removing the workspace from this computer", () => {
  const runner = createRunner({});
  it("is ready only when both repositories have nothing that isn't on the remote", { timeout: 60_000 }, async () => {
    const i = instance();
    const ready = await removalCheck(runner, i.ws);
    expect(ready).toMatchObject({ state: "ready", waiting: 0, folder: i.ws });
    expect(ready.repositories).toHaveLength(2);
    expect(ready.repositories[0]).toMatch(/notes$/);
    expect(ready.repositories[1]).toMatch(/private$/);
    // An unsaved change, a commit not pushed, and a note never committed, in either repository.
    write(join(i.ws, "notes", "hello.md"), "# Hello\n\nChanged.\n");
    expect(await removalCheck(runner, i.ws)).toMatchObject({ state: "unpushed", waiting: 1 });
    git(i.ws, "commit", "-qam", "Update notes/hello.md");
    expect(await removalCheck(runner, i.ws)).toMatchObject({ state: "unpushed", waiting: 1 });
    git(i.ws, "push", "-q");
    expect((await removalCheck(runner, i.ws)).state).toBe("ready");
    write(join(i.ws, "private", "notes", "new.md"), "# New\n");
    // Counted once, in the private repository, not again as the submodule's changed content.
    expect(await removalCheck(runner, i.ws)).toMatchObject({ state: "unpushed", waiting: 1 });
    git(join(i.ws, "private"), "add", "-A");
    git(join(i.ws, "private"), "commit", "-qm", "Add a private note");
    expect((await removalCheck(runner, i.ws)).state).toBe("unpushed");
    git(join(i.ws, "private"), "push", "-q");
    // The pointer to the pushed private commit isn't committed yet either.
    expect((await removalCheck(runner, i.ws)).state).toBe("unpushed");
    git(i.ws, "commit", "-qam", "Update private notes");
    git(i.ws, "push", "-q");
    expect((await removalCheck(runner, i.ws)).state).toBe("ready");
  });
  it("never applies to a folder that isn't a repository of its own", async () => {
    const plain = mkdtempSync(join(tmpdir(), "fn-plain-"));
    writeFileSync(join(plain, "Welcome.md"), "# Welcome\n");
    expect(await removalCheck(runner, plain)).toMatchObject({ state: "notGit" });
    expect(await removeWorkspace(runner, plain)).toMatchObject({ state: "notGit" });
    expect(existsSync(join(plain, "Welcome.md"))).toBe(true);
  });
  it("deletes the local clone and nothing on the remote, and refuses while anything is unpushed", { timeout: 60_000 }, async () => {
    const i = instance();
    write(join(i.ws, "notes", "draft.md"), "# Draft\n");
    expect(await removeWorkspace(runner, i.ws)).toMatchObject({ state: "unpushed" });
    expect(existsSync(join(i.ws, "notes", "draft.md"))).toBe(true);
    git(i.ws, "add", "-A");
    git(i.ws, "commit", "-qm", "Add notes/draft.md");
    git(i.ws, "push", "-q");
    const before = count(i.notesRemote);
    expect(await removeWorkspace(runner, i.ws)).toMatchObject({ state: "removed" });
    expect(existsSync(i.ws)).toBe(false);
    expect(count(i.notesRemote)).toBe(before);
    expect(execFileSync("git", ["--git-dir", i.notesRemote, "show", "main:notes/draft.md"], { encoding: "utf8" })).toBe("# Draft\n");
  });
});
