/**
 * PKG-13, D-228: the real bundle (GitHub Desktop's dugite-native, fetched by
 * tools/release/git-bundle.mjs into apps/desktop/vendor/git, or named by FOCUS_NOTES_GIT_BUNDLE) does
 * everything Focus Notes asks of Git, on a PATH with no other Git: the first run's check, Git
 * Credential Manager, a commit whose hook runs `git`, a rebase, a submodule, a push, and notes kept
 * with LF endings. D-270: none of Git Credential Manager's broker files that may not be redistributed,
 * the broker kept off, and a GitHub sign-in kept, given back and forgotten without it (a throwaway
 * store and a made-up account, never the computer's own). Skipped when the bundle hasn't been fetched
 * (`node tools/release/git-bundle.mjs`).
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Account } from "../src/main/first-run/account.ts";
import { createToolRunner, findProgram, gitProgramDirs } from "../src/main/first-run/tools.ts";
import { bundleEnv, findGitBundle } from "../src/main/git/bundle.ts";
import { createRunner } from "../src/main/git/run.ts";

const vendored = join(import.meta.dirname, "..", "vendor", "git");
const bundle = findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: process.env.FOCUS_NOTES_GIT_BUNDLE || vendored }, undefined, process.platform, true);

// CI fetches the bundle before the unit tests on Windows: there, a missing one is a failure, not a skip.
it.runIf(Boolean(process.env.CI) && process.platform === "win32")("PKG-13: CI on Windows has the bundle to test", () => {
  expect(bundle, "run node tools/release/git-bundle.mjs first").toBeDefined();
});

/** This process's environment with PATH cut to Windows' own folder: the only Git is the bundle's. */
function noOtherGit(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(path|git_.*|gcm_.*)$/i.test(k)) env[k] = v;
  const sys = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  return { ...env, Path: `${sys};${process.env.SystemRoot ?? "C:\\Windows"}`, HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: join(home, ".gitconfig") };
}

describe.skipIf(!bundle)("PKG-13: the bundled Git, end to end", () => {
  const home = mkdtempSync(join(tmpdir(), "fn-bundle-home-"));
  const env = noOtherGit(home);
  const run = createRunner({ bundle: bundle!, env });
  const git = async (cwd: string, ...args: string[]) => {
    const r = await run({ cwd, args, timeoutMs: 60_000 });
    if (r.code !== 0) throw new Error(`git ${args.join(" ")} (${r.code}): ${r.stderr}`);
    return r.stdout;
  };

  it("there's no other Git on the PATH these tests use", async () => {
    expect(await findProgram("git", env)).toBeUndefined();
    expect(await findProgram("git", bundleEnv(env, bundle!))).toBe(bundle!.git);
  });

  it("the first run's check: Git new enough, Git Credential Manager as its helper, and bundled", async () => {
    const account = new Account({ git: run, tools: createToolRunner(), fetch: async () => new Response("{}", { status: 401 }), home, env: bundleEnv(env, bundle!), bundled: true });
    const check = await account.gitCheck();
    expect(check).toMatchObject({ installed: true, ok: true, gcm: true, bundled: true });
    expect(check.version).toMatch(/^2\.(5[6-9]|[6-9]\d)\./);
  });

  it("Git Credential Manager starts from the bundle", async () => {
    const exec = (await git(home, "--exec-path")).trim();
    const gcm = await findProgram("git-credential-manager", bundleEnv(env, bundle!), gitProgramDirs(exec));
    expect(gcm?.toLowerCase().startsWith(bundle!.root.toLowerCase())).toBe(true);
    const r = await createToolRunner()(gcm!, { args: ["--version"], env: bundleEnv(env, bundle!), timeoutMs: 30_000 }).done;
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^2\.\d+\.\d+/);
  });

  it("commits with a hook that runs git, rebases, adds a submodule, pushes, and keeps notes' LF endings", async () => {
    const root = mkdtempSync(join(tmpdir(), "fn-bundle-repos-"));
    const remote = join(root, "remote.git");
    const a = join(root, "a"), b = join(root, "b"), lib = join(root, "lib");
    mkdirSync(remote);
    await git(remote, "init", "--bare", "-b", "main");
    for (const dir of [a, lib]) {
      mkdirSync(dir);
      await git(dir, "init", "-b", "main");
      await git(dir, "config", "user.name", "Ada");
      await git(dir, "config", "user.email", "ada@example.com");
    }
    writeFileSync(join(lib, "lib.md"), "# Lib\n");
    await git(lib, "add", "lib.md");
    await git(lib, "commit", "-m", "Add lib");

    // A hook, run by the bundle's sh, that runs git: it must reach the bundle's Git.
    writeFileSync(join(a, ".git", "hooks", "pre-commit"), "#!/bin/sh\ngit rev-parse --git-dir > hook-ran.txt\n");
    writeFileSync(join(a, ".gitattributes"), "* text=auto eol=lf\n");
    writeFileSync(join(a, "note.md"), "# Note\n\nOne\nTwo\n");
    await git(a, "add", ".gitattributes", "note.md");
    await git(a, "commit", "-m", "Add note");
    expect(readFileSync(join(a, "hook-ran.txt"), "utf8").trim()).toBe(".git");
    await git(a, "-c", "protocol.file.allow=always", "submodule", "add", lib, "lib");
    await git(a, "commit", "-m", "Add lib as a submodule");
    await git(a, "remote", "add", "origin", remote);
    await git(a, "push", "-u", "origin", "main");

    await git(root, "-c", "protocol.file.allow=always", "clone", "--recurse-submodules", remote, b);
    expect(readFileSync(join(b, "note.md"), "utf8")).toBe("# Note\n\nOne\nTwo\n");
    expect(existsSync(join(b, "lib", "lib.md"))).toBe(true);
    await git(b, "config", "user.name", "Ada");
    await git(b, "config", "user.email", "ada@example.com");
    writeFileSync(join(b, "other.md"), "# Other\n");
    await git(b, "add", "other.md");
    await git(b, "commit", "-m", "Add other");
    await git(b, "push");

    // a's own commit, then a rebase onto b's.
    writeFileSync(join(a, "note.md"), "# Note\n\nOne\nTwo\nThree\n");
    await git(a, "commit", "-am", "Update note");
    await git(a, "pull", "--rebase");
    await git(a, "push");
    expect((await git(a, "log", "--format=%s")).trim().split("\n")).toEqual(["Update note", "Add other", "Add lib as a submodule", "Add note"]);
    expect((await git(remote, "cat-file", "-p", "main:note.md")).replace(/\r\n/g, "\n")).toBe("# Note\n\nOne\nTwo\nThree\n");
    expect(await git(remote, "cat-file", "-p", "main:note.md")).not.toContain("\r");
  }, 120_000);

  it("D-270: carries none of the broker's files that may not be redistributed, and its settings keep the broker off", async () => {
    const files = readdirSync(bundle!.root, { recursive: true }).map(String);
    expect(files.filter((f) => /(?:^|[\\/])(?:Microsoft\.Identity\.Client\.NativeInterop\.dll|msalruntime[\w.-]*\.dll)$/i.test(f))).toEqual([]);
    expect(files.some((f) => /[\\/]Microsoft\.Identity\.Client\.dll$/i.test(f)), "the managed MSAL stays").toBe(true);
    expect((await git(home, "config", "--system", "--get", "credential.msauthUseBroker")).trim()).toBe("false");
  });

  it("D-270: Git Credential Manager keeps, gives back and forgets a GitHub sign-in without the broker, even when the person turned it on", async () => {
    const gcmHome = mkdtempSync(join(tmpdir(), "fn-gcm-home-"));
    writeFileSync(join(gcmHome, ".gitconfig"), "[credential]\n\tmsauthUseBroker = true\n");
    const trace = join(gcmHome, "trace.log");
    // Never the computer's own credential store: a throwaway plaintext one, and a made-up account.
    const gcm = createRunner({ bundle: bundle!, env: { ...noOtherGit(gcmHome), GCM_CREDENTIAL_STORE: "plaintext", GCM_PLAINTEXT_STORE_PATH: join(gcmHome, "store"), GCM_TRACE: trace } });
    const credential = async (action: string, input: string) => {
      const r = await gcm({ cwd: gcmHome, args: ["credential", action], input, timeoutMs: 60_000 });
      expect(r.code, `git credential ${action}: ${r.stderr}`).toBe(0);
      return r.stdout;
    };
    const ask = "protocol=https\nhost=github.com\n\n";
    await credential("approve", "protocol=https\nhost=github.com\nusername=fn-test\npassword=not-a-real-token\n\n");
    expect(await credential("fill", ask)).toMatch(/^username=fn-test\npassword=not-a-real-token$/m);
    await credential("reject", "protocol=https\nhost=github.com\nusername=fn-test\n\n");
    const r = await gcm({ cwd: gcmHome, args: ["credential", "fill"], input: ask, timeoutMs: 60_000 });
    expect(r.code).not.toBe(0);
    const log = readFileSync(trace, "utf8");
    expect(log).toContain("Host provider 'GitHub' was selected");
    expect(log).not.toMatch(/msalruntime|NativeInterop/i);
  }, 120_000);
});
