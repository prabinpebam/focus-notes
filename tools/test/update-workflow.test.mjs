/**
 * DST-06 (WP-5.6, D-135): the template's Update app workflow and its script, and publishing the
 * template repository from a release. Updates arrive as one pull request from a bot branch that
 * changes only the pin and the template-managed files the manifest lists, after the release's bundle
 * and template pass their SHA-256 and attestation checks; nothing merges by itself.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  BRANCH, PIN, MANIFEST, assetsOf, checkManagedPath, compareVersions, decide, isWorkflow, pickLatest, planUpdate, prBody, prTitle, readManifest, readPin,
} from "../../templates/workspace/.github/focus-notes/update.mjs";
import { checkVersion, commitMessage, sumFor, verifyArgs } from "../release/publish-template.mjs";

const root = join(import.meta.dirname, "..", "..");
const tpl = join(root, "templates", "workspace");
const text = readFileSync(join(tpl, ".github", "workflows", "update.yml"), "utf8");
const wf = yaml.load(text);
const steps = (job) => wf.jobs[job].steps;
const named = (job, re) => steps(job).find((s) => re.test(s.name ?? ""));
const SHA = "ab".repeat(32);
const ON_DEFAULT = "github.event_name == 'schedule' || github.ref == format('refs/heads/{0}', github.event.repository.default_branch)";
const release = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, assets: assetsOf(tag.slice(1)).map((name) => ({ name })), ...extra });

describe("DST-06: the Update app workflow's shape", () => {
  it("runs weekly and by hand, never on pull requests", () => {
    expect(wf.on.schedule).toHaveLength(1);
    expect(wf.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* [0-6]$/);
    expect(wf.on).toHaveProperty("workflow_dispatch");
    expect(Object.keys(wf.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(text).not.toMatch(/pull_request_target/);
    expect(wf.concurrency).toEqual({ group: "update-app", "cancel-in-progress": false });
  });

  it("SEC-05: least privilege: read-only by default, and only the pull-request job writes contents and pull requests", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(Object.keys(wf.jobs)).toEqual(["check", "pull-request"]);
    expect(wf.jobs.check.permissions).toEqual({ contents: "read", attestations: "read" });
    expect(wf.jobs["pull-request"].permissions).toEqual({ contents: "write", "pull-requests": "write" });
    expect(wf.jobs["pull-request"].needs).toBe("check");
    // The writing job runs only from the default branch, and only when there's a newer release.
    expect(wf.jobs["pull-request"].if).toBe(`needs.check.outputs.version != '' && (${ON_DEFAULT})`);
    // The template repository is published from releases instead (publish-template.mjs).
    expect(wf.jobs.check.if).toBe("github.repository != 'prabinpebam/focus-notes-workspace'");
  });

  it("SEC-05: pins every action by a full commit SHA, drops checkout credentials, and holds no secrets", () => {
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)(.*)$/gm)];
    expect(uses.length).toBeGreaterThanOrEqual(6);
    for (const [, ref, rest] of uses) {
      expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(rest, ref).toMatch(/#\s*v\d+/);
    }
    const all = [...steps("check"), ...steps("pull-request")];
    expect(all.filter((s) => s.uses)).toHaveLength(uses.length);
    for (const s of all.filter((x) => x.uses?.startsWith("actions/checkout@"))) expect(s.with["persist-credentials"]).toBe(false);
    for (const s of all.filter((x) => x.uses?.startsWith("actions/setup-node@"))) expect(s.with["package-manager-cache"]).toBe(false);
    expect(text).not.toMatch(/secrets\./);
  });

  it("never expands ${{ }} inside a script: values reach scripts through env", () => {
    for (const s of [...steps("check"), ...steps("pull-request")]) if (s.run) expect(s.run, s.name).not.toContain("${{");
  });

  it("checks the SHA-256 and the release workflow's attestation for exactly that tag before planning anything", () => {
    const order = [/Find the latest/, /Download/, /SHA-256/, /attestations/, /Plan the update/].map((re) => steps("check").findIndex((s) => re.test(s.name ?? "")));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(named("check", /SHA-256/).run).toMatch(/test "\$\(wc -l < checked\.sums\)" -eq 2/);
    expect(named("check", /SHA-256/).run).toMatch(/sha256sum --check --strict checked\.sums/);
    const attest = named("check", /attestations/).run;
    for (const f of ["focus-notes-web-$VERSION.tgz", "focus-notes-workspace-$VERSION.tgz"]) expect(attest).toContain(`"${f}"`);
    expect(attest).toContain('gh attestation verify "$RUNNER_TEMP/release/$f" --repo "$FOCUS_NOTES_SOURCE" --signer-workflow "$FOCUS_NOTES_SOURCE/.github/workflows/release.yml" --source-ref "refs/tags/v$VERSION"');
    expect(wf.env.FOCUS_NOTES_SOURCE).toBe("prabinpebam/focus-notes");
    // Hidden folders (.focus-notes/, .github/) must reach the writing job.
    expect(steps("check").at(-1).with["include-hidden-files"]).toBe(true);
  });

  it("the writing job only opens or updates the pull request; it never merges", () => {
    const run = steps("pull-request").filter((s) => s.run).map((s) => s.run).join("\n");
    expect(run).toBe('node .github/focus-notes/update.mjs open --plan "$RUNNER_TEMP/update"');
    const script = readFileSync(join(tpl, ".github", "focus-notes", "update.mjs"), "utf8");
    expect(script).not.toMatch(/\/merge|auto_merge|enablePullRequestAutoMerge/);
  });
});

describe("DST-06: which release an instance moves to", () => {
  it("takes the newest v<x.y.z> release with a bundle, a template and SHA256SUMS, never preview, a dry run, a draft or a suffix", () => {
    const releases = [
      release("preview", { prerelease: true, assets: [{ name: "focus-notes-web-9.9.9.tgz" }] }),
      release("v9.0.0-dryrun.1"), release("v8.0.0-beta.1"), release("v7.0.0", { draft: true }),
      release("v6.0.0", { assets: [{ name: "focus-notes-web-6.0.0.tgz" }] }),
      release("v0.10.0", { prerelease: true }), release("v0.9.3", { prerelease: true }), release("v0.2.0"),
    ];
    expect(pickLatest(releases)).toBe("0.10.0");
    expect(pickLatest([])).toBeNull();
  });

  it("compares versions by number, and a suffixed version comes first", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(-1);
    expect(compareVersions("0.0.0", "0.1.0")).toBe(-1);
    expect(() => compareVersions("1.0", "1.0.0")).toThrow(/version/);
  });

  it("reads the pin the Deploy app workflow reads, and refuses anything else", () => {
    expect(readPin(readFileSync(join(tpl, PIN), "utf8"))).toEqual({ version: "0.0.0", sha256: "0".repeat(64) });
    expect(() => readPin('{ "version": "1.2.3\\nX=1", "sha256": "' + SHA + '" }')).toThrow(/version/);
    expect(() => readPin('{ "version": "1.2.3", "sha256": "nope" }')).toThrow(/SHA-256/);
  });
});

describe("DST-06: what an update may change", () => {
  it("the manifest lists the pin, the update script and the two workflows, and is valid", () => {
    expect(readManifest(readFileSync(join(tpl, MANIFEST), "utf8"))).toEqual([
      ".focus-notes/app.json", ".focus-notes/managed.json", ".github/focus-notes/update.mjs", ".github/workflows/pages.yml", ".github/workflows/update.yml",
    ]);
  });

  it("never notes, private notes, the format, .git, or a path that climbs out", () => {
    for (const p of ["notes/a.md", "Notes/a.md", "private", "private/notes/x.md", ".gitmodules", ".focus-notes/workspace.json", ".git/config", "a/.GIT/x"]) {
      expect(() => checkManagedPath(p), p).toThrow(/never changes/);
    }
    for (const p of ["../x", "/etc/passwd", "a//b", "./a", "a\\b", "", 3]) expect(() => checkManagedPath(p), String(p)).toThrow(/plain relative/);
    expect(() => readManifest('{ "managed": ["README.md"] }')).toThrow(/app\.json/);
    expect(() => readManifest(`{ "managed": ["${PIN}", "${PIN}"] }`)).toThrow(/twice/);
  });

  const files = (o) => (p) => (p in o ? o[p] : null);
  const manifest = JSON.stringify({ managed: [PIN, ".github/focus-notes/update.mjs", ".github/workflows/pages.yml", "AGENTS.md"] });
  const next = files({ [PIN]: JSON.stringify({ version: "1.2.3", sha256: SHA }), [MANIFEST]: manifest, ".github/focus-notes/update.mjs": "new", ".github/workflows/pages.yml": "new wf", "notes/x.md": "never" });
  const current = files({ [PIN]: "old", ".github/focus-notes/update.mjs": "new", ".github/workflows/pages.yml": "old wf", "notes/x.md": "mine" });

  it("changes only the listed files that differ; workflow files are listed for a manual copy; missing ones stay", () => {
    expect(planUpdate({ version: "1.2.3", bundleSha256: SHA, readNext: next, readCurrent: current })).toEqual({ version: "1.2.3", write: [PIN], manual: [".github/workflows/pages.yml"] });
    expect(isWorkflow(".github/workflows/update.yml")).toBe(true);
    expect(isWorkflow(".github/focus-notes/update.mjs")).toBe(false);
  });

  it("refuses a template that pins another version or a bundle other than the one checked", () => {
    expect(() => planUpdate({ version: "1.2.4", bundleSha256: SHA, readNext: next, readCurrent: current })).toThrow(/pins 1\.2\.3/);
    expect(() => planUpdate({ version: "1.2.3", bundleSha256: "cd".repeat(32), readNext: next, readCurrent: current })).toThrow(/different bundle/);
  });
});

describe("DST-06: one update pull request at a time, which the owner merges", () => {
  it("creates one, moves it to a newer release, and leaves it when it's already there", () => {
    expect(decide({ version: "1.2.3", open: [] })).toEqual({ action: "create" });
    expect(decide({ version: "1.2.3", open: [{ number: 7, title: "Something else", head: { ref: "feature" } }] })).toEqual({ action: "create" });
    expect(decide({ version: "1.2.3", open: [{ number: 8, title: prTitle("1.2.2"), head: { ref: BRANCH } }] })).toEqual({ action: "update", number: 8 });
    expect(decide({ version: "1.2.3", open: [{ number: 8, title: prTitle("1.2.3"), head: { ref: BRANCH } }] })).toEqual({ action: "none", number: 8 });
    expect(BRANCH).toBe("focus-notes/update");
  });

  it("says what changed, what to copy by hand, and that nothing changes until it's merged", () => {
    const body = prBody({ from: "1.2.2", version: "1.2.3", write: [PIN], manual: [".github/workflows/pages.yml"] });
    expect(body).toContain("releases/tag/v1.2.3");
    expect(body).toContain("- `.focus-notes/app.json`");
    expect(body).toMatch(/Copy these yourself[\s\S]*- `\.github\/workflows\/pages\.yml`/);
    expect(body).toContain("Nothing changes until you merge");
  });
});

describe("DST-06: publishing the template repository from a release, by hand", () => {
  it("takes only plain release versions, checks SHA256SUMS, and verifies the release workflow's attestation for that tag", () => {
    expect(checkVersion("1.2.3")).toBe("1.2.3");
    for (const v of ["preview", "1.2.3-dryrun.1", "1.2", undefined]) expect(() => checkVersion(v)).toThrow(/release version/);
    const sums = `${SHA}  focus-notes-workspace-1.2.3.tgz\n${"cd".repeat(32)}  focus-notes-web-1.2.3.tgz\n`;
    expect(sumFor(sums, "focus-notes-workspace-1.2.3.tgz")).toBe(SHA);
    expect(() => sumFor(sums, "x.tgz")).toThrow(/0 lines/);
    expect(verifyArgs("f.tgz", "1.2.3")).toEqual([
      "attestation", "verify", "f.tgz", "--repo", "prabinpebam/focus-notes",
      "--signer-workflow", "prabinpebam/focus-notes/.github/workflows/release.yml", "--source-ref", "refs/tags/v1.2.3",
    ]);
    expect(commitMessage("1.2.3")).toBe("Focus Notes 1.2.3: the template pinned to focus-notes-web-1.2.3.tgz");
  });

  it("PKG-04: no workflow in this repository holds a token for the template repository", () => {
    for (const f of ["release.yml", "ci.yml"]) expect(readFileSync(join(root, ".github", "workflows", f), "utf8")).not.toMatch(/secrets\.|focus-notes-workspace"?\s*$/m);
  });
});
