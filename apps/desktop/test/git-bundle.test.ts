/**
 * PKG-13, D-228: the Git the Microsoft Store package carries. Where it's looked for and in what
 * order, the environment every Git and sign-in helper process gets, and that the runner starts the
 * bundle's Git rather than PATH's. The real bundle runs end to end in git-bundle.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundleEnv, findGitBundle, type GitBundle } from "../src/main/git/bundle.ts";
import { createRunner } from "../src/main/git/run.ts";

/** A folder shaped like the bundle: `cmd\git.exe` (empty: these tests never start it). */
function fakeBundle(parent = mkdtempSync(join(tmpdir(), "fn-bundle-")), name = "git"): string {
  const root = join(parent, name);
  mkdirSync(join(root, "cmd"), { recursive: true });
  writeFileSync(join(root, "cmd", "git.exe"), "");
  return root;
}

describe("PKG-13: finding the bundled Git", () => {
  it("takes resources\\git first, then FOCUS_NOTES_GIT_BUNDLE in a development run, and only on Windows", () => {
    const resources = mkdtempSync(join(tmpdir(), "fn-res-"));
    const beside = fakeBundle(resources);
    const named = fakeBundle();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: named }, resources, "win32", true)).toEqual({ root: beside, git: join(beside, "cmd", "git.exe"), cmdDir: join(beside, "cmd") });
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: named }, mkdtempSync(join(tmpdir(), "fn-res-")), "win32", true)?.root).toBe(named);
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: ` ${named} ` }, undefined, "win32", true)?.root).toBe(named);
    for (const platform of ["darwin", "linux"] as const) expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: named }, resources, platform, true)).toBeUndefined();
  });
  it("never lets the environment choose a packaged app's Git, a relative folder or a network share", () => {
    const named = fakeBundle();
    const resources = mkdtempSync(join(tmpdir(), "fn-res-"));
    // The installer and the portable: packaged, with no resources\\git, so PATH's Git, whatever the variable says.
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: named }, resources, "win32", false)).toBeUndefined();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: "vendor\\git" }, undefined, "win32", true)).toBeUndefined();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: "\\\\server\\share\\git" }, undefined, "win32", true)).toBeUndefined();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: "//server/share/git" }, undefined, "win32", true)).toBeUndefined();
  });
  it("isn't there without cmd\\git.exe: the installer, the portable and development use PATH's Git", () => {
    const empty = mkdtempSync(join(tmpdir(), "fn-res-"));
    mkdirSync(join(empty, "git", "cmd"), { recursive: true });
    expect(findGitBundle({}, empty, "win32")).toBeUndefined();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: "" }, undefined, "win32", true)).toBeUndefined();
    expect(findGitBundle({ FOCUS_NOTES_GIT_BUNDLE: join(empty, "nope") }, undefined, "win32", true)).toBeUndefined();
  });
});

describe("PKG-13: the environment Git and its helpers get", () => {
  const bundle: GitBundle = { root: "C:\\App\\resources\\git", git: "C:\\App\\resources\\git\\cmd\\git.exe", cmdDir: "C:\\App\\resources\\git\\cmd" };
  it("puts the bundle's cmd first on PATH under one name, and drops an inherited GIT_EXEC_PATH", () => {
    const env = bundleEnv({ Path: "C:\\Windows", PATH: "", GIT_EXEC_PATH: "C:\\Other\\Git\\mingw64\\libexec\\git-core", HOME: "C:\\Users\\ada" }, bundle);
    expect(Object.keys(env).filter((k) => k.toUpperCase() === "PATH")).toEqual(["Path"]);
    expect(env.Path).toBe("C:\\App\\resources\\git\\cmd;C:\\Windows");
    expect(env.GIT_EXEC_PATH).toBeUndefined();
    expect(env.HOME).toBe("C:\\Users\\ada");
    expect(bundleEnv({}, bundle)).toEqual({ Path: "C:\\App\\resources\\git\\cmd" });
  });
  it("leaves the environment as it is when there's no bundle", () => {
    const base = { PATH: "/usr/bin", GIT_EXEC_PATH: "/x" };
    expect(bundleEnv(base, undefined)).toBe(base);
  });
});

describe("PKG-13: the runner uses the bundled Git", () => {
  it("starts the bundle's git.exe with its cmd first on PATH; a test's own git still wins", async () => {
    // An empty git.exe can't start, which shows it was the one tried and not PATH's Git.
    const root = fakeBundle();
    const bundle: GitBundle = { root, git: join(root, "cmd", "git.exe"), cmdDir: join(root, "cmd") };
    const seen: NodeJS.ProcessEnv[] = [];
    const bundled = await createRunner({ bundle, env: { Path: "C:\\Windows" }, here: true, onSpawn: (_a, env) => seen.push(env) })({ cwd: tmpdir(), args: ["--version"] });
    expect(bundled.code).toBe(-1);
    expect(bundled.stderr).toMatch(/EFTYPE|ENOENT|EACCES|UNKNOWN/);
    expect(seen[0]?.Path?.split(";")[0]).toBe(bundle.cmdDir);
    // The same through Git's worker thread, where calls normally run.
    expect((await createRunner({ bundle, env: { Path: "C:\\Windows" } })({ cwd: tmpdir(), args: ["--version"] })).code).toBe(-1);
    const system = await createRunner({ bundle: null, here: true })({ cwd: tmpdir(), args: ["--version"] });
    expect(system).toMatchObject({ code: 0 });
    expect(system.stdout).toMatch(/^git version /);
    const given: NodeJS.ProcessEnv[] = [];
    await createRunner({ git: "git", bundle, env: { Path: "C:\\Windows" }, here: true, onSpawn: (_a, env) => given.push(env) })({ cwd: tmpdir(), args: ["--version"] });
    expect(given[0]?.Path).toBe("C:\\Windows");
  });
  it("no runner in the app names its own git, so every call can reach the bundle", () => {
    const src = join(import.meta.dirname, "..", "src", "main");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".ts") ? [join(dir, n)] : []));
    const offenders = files(src).filter((f) => /createRunner\(\{[^)]*\bgit:/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
