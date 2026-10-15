/**
 * The release tools (DST-03, D-128): the version and dry-run rules, the notes from the commits since
 * the last tag, the CycloneDX SBOM, the workspace template pinned to a bundle, and the web app bundle
 * itself, packed from a real publisher and page renderer and smoke-tested with nothing else installed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseVersion } from "../release/version.mjs";
import { commitsSince, previousTag, releaseNotes } from "../release/notes.mjs";
import { cyclonedx, purl } from "../release/sbom.mjs";
import { packTemplate, pinApp, pinFormat, sha256Of, templateName } from "../release/template.mjs";
import { bundleName, LAYOUT, pack, smoke } from "../release/web-bundle.mjs";
import { readTgz } from "../../templates/workspace/.github/focus-notes/update.mjs";

const root = join(import.meta.dirname, "..", "..");
const tplPin = readFileSync(join(root, "templates", "workspace", ".focus-notes", "app.json"), "utf8");
const SHA = "ab".repeat(32);

describe("DST-03: the version a release run builds", () => {
  const base = { packageVersion: "0.0.1", runNumber: "42" };
  it("a v<x.y.z> tag releases that version; below 1.0.0 or with a suffix it's a pre-release", () => {
    expect(releaseVersion({ ...base, refType: "tag", refName: "v1.2.3" })).toEqual({ version: "1.2.3", tag: "v1.2.3", dryRun: false, prerelease: false });
    expect(releaseVersion({ ...base, refType: "tag", refName: "v0.5.1" })).toMatchObject({ version: "0.5.1", prerelease: true });
    expect(releaseVersion({ ...base, refType: "tag", refName: "v1.3.0-beta.2" })).toMatchObject({ version: "1.3.0-beta.2", prerelease: true, dryRun: false });
  });
  it("a -dryrun tag, or a manual run with dry run ticked, never publishes", () => {
    expect(releaseVersion({ ...base, refType: "tag", refName: "v0.0.2-dryrun.1" }).dryRun).toBe(true);
    expect(releaseVersion({ ...base, refType: "tag", refName: "v0.0.2-dryrun" }).dryRun).toBe(true);
    expect(releaseVersion({ ...base, refType: "tag", refName: "v1.2.3", dryRunInput: "true" }).dryRun).toBe(true);
    expect(releaseVersion({ ...base, refType: "tag", refName: "v1.2.3", dryRunInput: "TRUE" }).dryRun).toBe(true);
    expect(releaseVersion({ ...base, refType: "branch", refName: "wp-5.5", dryRunInput: "true" })).toEqual({ version: "0.0.1-dryrun.42", tag: "v0.0.1-dryrun.42", dryRun: true, prerelease: true });
  });
  it("L7: refuses a tag that looks like a dry run, in any case or spelling, unless it's exactly -dryrun", () => {
    for (const t of ["v1.2.3-DRYRUN.1", "v1.2.3-DryRun", "v1.2.3-dry-run.1", "v1.2.3-dry.run", "v1.2.3-beta.dryrun", "v1.2.3-dryrun1", "v1.2.3-xdryrun"]) {
      expect(() => releaseVersion({ ...base, refType: "tag", refName: t }), t).toThrow(/dry run/);
    }
  });
  it("refuses a real release from a branch, and a tag that isn't a version", () => {
    expect(() => releaseVersion({ ...base, refType: "branch", refName: "main", dryRunInput: "false" })).toThrow(/Only a v<version> tag/);
    expect(() => releaseVersion({ ...base, refType: "tag", refName: "v1.2" })).toThrow(/v1\.2\.3/);
    expect(() => releaseVersion({ ...base, refType: "tag", refName: "v1.2.3;rm" })).toThrow();
  });
});

describe("DST-03: release notes from the commits since the last tag", () => {
  let repo;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "fn-notes-"));
    const g = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
    g("init", "-q", "-b", "main");
    g("config", "user.email", "t@example.com"); g("config", "user.name", "T"); g("config", "commit.gpgsign", "false"); g("config", "tag.gpgsign", "false");
    const commit = (m) => { writeFileSync(join(repo, "f.txt"), m); g("add", "."); g("commit", "-q", "-m", m); };
    commit("First"); g("tag", "v0.0.1");
    commit("Fix the *caret* in `code`"); g("tag", "v0.0.2-dryrun.1");
    commit("Add a thing");
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("lists the commits after the last release tag, skipping dry-run tags", () => {
    expect(previousTag("HEAD", repo)).toBe("v0.0.1");
    expect(commitsSince("v0.0.1", "HEAD", repo).map((c) => c.subject)).toEqual(["Add a thing", "Fix the *caret* in `code`"]);
    expect(previousTag("v0.0.1", repo)).toBeNull();
    expect(commitsSince(null, "v0.0.1", repo).map((c) => c.subject)).toEqual(["First"]);
  });

  it("writes Markdown with each commit escaped, and how to check a download", () => {
    const md = releaseNotes({ tag: "v0.0.2", previous: "v0.0.1", commits: commitsSince("v0.0.1", "HEAD", repo) });
    expect(md).toMatch(/^## Changes since v0\.0\.1\n/);
    expect(md).toContain("- Fix the \\*caret\\* in \\`code\\` (");
    expect(md).toContain("sha256sum --check --ignore-missing SHA256SUMS");
    expect(md).toContain("gh attestation verify <file> --repo prabinpebam/focus-notes --signer-workflow prabinpebam/focus-notes/.github/workflows/release.yml --source-ref refs/tags/v0.0.2");
    expect(md).toMatch(/aren't code-signed yet \(DSK-07\)/);
    expect(md).toContain("focus-notes-web-0.0.2.tgz");
    expect(releaseNotes({ tag: "v1.0.0", previous: null, commits: [] })).toMatch(/^## Changes\n\n- No changes\./);
  });
});

describe("DST-03: the SBOM", () => {
  it("is CycloneDX 1.6 with every shipped package, its purl and license", () => {
    const bom = cyclonedx({ MIT: [{ name: "react", versions: ["19.2.8"] }, { name: "@tiptap/core", versions: ["3.0.0", "3.1.0"] }], "(MIT OR Apache-2.0)": [{ name: "x", versions: ["1.0.0"] }] }, { version: "1.2.3", timestamp: "2026-10-15T00:00:00.000Z" });
    expect(bom).toMatchObject({ bomFormat: "CycloneDX", specVersion: "1.6", metadata: { timestamp: "2026-10-15T00:00:00.000Z", component: { name: "focus-notes", version: "1.2.3" } } });
    expect(bom.components.map((c) => c.purl)).toEqual(["pkg:npm/%40tiptap/core@3.0.0", "pkg:npm/%40tiptap/core@3.1.0", "pkg:npm/react@19.2.8", "pkg:npm/x@1.0.0"]);
    expect(bom.components.find((c) => c.name === "react").licenses).toEqual([{ license: { id: "MIT" } }]);
    expect(bom.components.find((c) => c.name === "x").licenses).toEqual([{ expression: "(MIT OR Apache-2.0)" }]);
    expect(bom.dependencies[0].dependsOn).toHaveLength(4);
    expect(purl("@a/b", "1.0.0")).toBe("pkg:npm/%40a/b@1.0.0");
  });
});

describe("DST-06 groundwork: the workspace template pinned to a release's bundle", () => {
  it("pins the version and the SHA-256 together in .focus-notes/app.json, replacing the placeholder, and nothing else", () => {
    expect(JSON.parse(tplPin)).toEqual({ version: "0.0.0", sha256: "0".repeat(64) });
    expect(JSON.parse(pinApp(tplPin, { version: "1.2.3", sha256: SHA }))).toEqual({ version: "1.2.3", sha256: SHA });
    // The workflows' hashes, so a copy can tell when its workflows weren't copied by hand (D-137).
    const workflows = { ".github/workflows/pages.yml": SHA };
    expect(JSON.parse(pinApp(tplPin, { version: "1.2.3", sha256: SHA, workflows }))).toEqual({ version: "1.2.3", sha256: SHA, workflows });
    expect(() => pinApp(tplPin, { version: "1.2.3", sha256: SHA, workflows: { "README.md": SHA } })).toThrow(/workflow/);
    expect(() => pinApp(tplPin, { version: "1.2.3", sha256: "nope" })).toThrow(/SHA-256/);
    expect(() => pinApp(tplPin, { version: "1.2", sha256: SHA })).toThrow(/version/);
    expect(() => pinApp('{ "version": "0.0.0", "sha256": "", "source": "x/y" }', { version: "1.2.3", sha256: SHA })).toThrow(/exactly/);
  });

  it("names the same version as templateVersion in .focus-notes/workspace.json", () => {
    expect(JSON.parse(pinFormat('{ "formatVersion": 1, "templateVersion": "0.0.0" }\n', "1.2.3"))).toEqual({ formatVersion: 1, templateVersion: "1.2.3" });
  });

  it("packs the whole template, pinned to the bundle's real SHA-256", () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-tpl-"));
    try {
      const bundle = join(dir, "focus-notes-web-1.2.3.tgz");
      writeFileSync(bundle, "not really a bundle");
      const { file, sha256 } = packTemplate({ version: "1.2.3", bundle, out: dir });
      expect(file).toBe(join(dir, templateName("1.2.3")));
      expect(sha256).toBe(sha256Of(bundle));
      const x = join(dir, "x"); mkdirSync(x);
      execFileSync("tar", ["-xzf", join("..", templateName("1.2.3"))], { cwd: x });
      const workflows = Object.fromEntries(["pages.yml", "update.yml"].map((w) => [`.github/workflows/${w}`, sha256Of(join(x, ".github", "workflows", w))]));
      expect(JSON.parse(readFileSync(join(x, ".focus-notes", "app.json"), "utf8"))).toEqual({ version: "1.2.3", sha256, workflows });
      // The update script reads the same archive in memory, with no links and nothing unpacked.
      const files = readTgz(readFileSync(file));
      expect(files.get(".focus-notes/app.json").toString()).toBe(readFileSync(join(x, ".focus-notes", "app.json"), "utf8"));
      expect(files.has("notes/.gitkeep")).toBe(true);
      expect(JSON.parse(readFileSync(join(x, ".focus-notes", "workspace.json"), "utf8")).templateVersion).toBe("1.2.3");
      for (const f of ["AGENTS.md", "README.md", ".gitattributes", "notes/.gitkeep", ".focus-notes/managed.json", ".github/workflows/update.yml", ".github/focus-notes/update.mjs"]) expect(readFileSync(join(x, f))).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("DST-03, D-98: the web app bundle", () => {
  let base;
  beforeAll(() => {
    // A real publisher and page renderer, built into a scratch copy of the layout; a stand-in app.
    base = mkdtempSync(join(tmpdir(), "fn-web-"));
    const web = join(base, "apps", "web");
    mkdirSync(join(web, "dist"), { recursive: true });
    writeFileSync(join(web, "dist", "index.html"), "<!doctype html><title>Focus Notes</title>");
    const vite = (config, out) => execSync(`pnpm --filter @focus-notes/web exec vite build --config ${config} --outDir "${out}" --emptyOutDir --logLevel error`, { cwd: root, stdio: "ignore" });
    vite("vite.publish.config.ts", join(web, "dist-publish"));
    vite("vite.reader.config.ts", join(web, "dist-reader"));
    for (const f of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(join(root, f), join(base, f));
  }, 180_000);
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it("holds app/, publish/ (the publisher, the page renderer, its assets), the license and notices", () => {
    expect(LAYOUT.map((p) => p.to)).toEqual(["app", "publish/cli.mjs", "publish/render.mjs", "publish/assets", "LICENSE", "THIRD_PARTY_NOTICES.md"]);
    expect(() => pack({ version: "1.2.3", out: join(base, "out"), base: join(base, "nowhere") })).toThrow(/Build these first/);
    expect(() => pack({ version: "latest", out: join(base, "out"), base })).toThrow(/Not a version/);
  });

  it("is named for its version, and its publisher publishes a sample note with nothing else installed", () => {
    const file = pack({ version: "1.2.3", out: join(base, "out"), base, commit: "abc" });
    expect(file).toBe(join(base, "out", bundleName("1.2.3")));
    const { version, files, pages } = smoke(file);
    expect(version).toBe("1.2.3");
    for (const f of ["bundle.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "app/index.html", "publish/cli.mjs", "publish/render.mjs"]) expect(files).toContain(f);
    expect(files.some((f) => f.startsWith("publish/assets/") && f.endsWith(".css"))).toBe(true);
    // The sample note's page and the index of public notes (D-139), from the bundle's own renderer.
    expect([...pages].sort()).toEqual(["n/hello/index.html", "n/index.html"]);
  });
});
