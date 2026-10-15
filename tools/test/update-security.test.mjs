/**
 * DST-06 after the security review of wp-5.6 (D-137): archives read without unpacking and with no
 * link members, an allow-list of template-managed paths, a 3-day wait for new releases, attestations
 * bound to the exact signing identity on hosted runners, a bot branch that's checked before it moves,
 * workflow hashes for files copied by hand, a minimum version, and a template publisher that never
 * unpacks into a clone.
 */
import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import {
  BOT, PIN, BRANCH, botBranchOk, checkManagedPath, checkPath, compareLink, decide, pickLatest, planUpdate, prBody, prTitle, readPin, readTgz, titleVersion,
} from "../../templates/workspace/.github/focus-notes/update.mjs";
import { checkNotOlder, checkRepo, gitArgs, verifyArgs } from "../release/publish-template.mjs";

const root = join(import.meta.dirname, "..", "..");
const tpl = join(root, "templates", "workspace");
const load = (p) => { const text = readFileSync(join(root, p), "utf8"); return { text, wf: yaml.load(text) }; };
const update = load("templates/workspace/.github/workflows/update.yml");
const pages = load("templates/workspace/.github/workflows/pages.yml");
const releaseWf = load(".github/workflows/release.yml");
const SHA = "ab".repeat(32);
const sha = (s) => createHash("sha256").update(s).digest("hex");
const IDENTITY = '--cert-identity "https://github.com/$FOCUS_NOTES_SOURCE/.github/workflows/release.yml@refs/tags/v$VERSION"';

/** A ustar member, as GNU tar and bsdtar write them. */
function member(name, { type = "0", body = "", link = "" } = {}) {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write("0000644\0", 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  h.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124);
  h.write("00000000000\0", 136);
  h.write(type, 156);
  h.write(link, 157, 100);
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.fill(" ", 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
  const data = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
  data.write(body);
  return Buffer.concat([h, data]);
}
const tgz = (...members) => gzipSync(Buffer.concat([...members, Buffer.alloc(1024)]));

describe("#6, #1: archives are read in memory, and refused if they hold anything but plain files and folders", () => {
  it("reads regular files under ./, skipping folders", () => {
    const files = readTgz(tgz(member("./", { type: "5" }), member("./notes/", { type: "5" }), member("./notes/.gitkeep"), member("./.focus-notes/app.json", { body: "{}" })));
    expect([...files.keys()]).toEqual(["notes/.gitkeep", ".focus-notes/app.json"]);
    expect(files.get(".focus-notes/app.json").toString()).toBe("{}");
  });

  it("refuses symlinks, hard links, devices, .git, absolute and climbing paths, odd characters, duplicates and bad checksums", () => {
    expect(() => readTgz(tgz(member("./.github", { type: "2", link: "/etc" })))).toThrow(/not a plain file/);
    expect(() => readTgz(tgz(member("./README.md", { type: "1", link: "x" })))).toThrow(/not a plain file/);
    expect(() => readTgz(tgz(member("./dev", { type: "3" })))).toThrow(/not a plain file/);
    for (const bad of ["./.git/config", "/etc/passwd", "../x", "./a/../../x", "./a b", "./Notes/.GIT/hooks/x"]) expect(() => readTgz(tgz(member(bad))), bad).toThrow();
    expect(() => readTgz(tgz(member("./a"), member("a")))).toThrow(/twice/);
    const broken = member("./a"); broken[0] = "b".charCodeAt(0);
    expect(() => readTgz(tgz(broken))).toThrow(/checksum/);
  });

  it("#5: a path is plain ASCII segments, never . or ..", () => {
    for (const ok of ["a", ".focus-notes/app.json", "notes/.gitkeep", "a_b-c.d/e"]) expect(checkPath(ok)).toBe(ok);
    for (const bad of ["", "a b", "a/./b", "a/../b", "..", "é", "a\\b", "/a", "a/", "a//b"]) expect(() => checkPath(bad), bad).toThrow(/plain relative/);
  });
});

describe("#4: an installed instance changes only allow-listed files, and says when the update script changes", () => {
  it("allows the pin, the manifest, the update scripts, the two workflows, README.md and AGENTS.md, and nothing else", () => {
    for (const ok of [PIN, ".focus-notes/managed.json", ".github/focus-notes/update.mjs", ".github/focus-notes/other.mjs", ".github/workflows/pages.yml", ".github/workflows/update.yml", "README.md", "AGENTS.md"]) {
      expect(checkManagedPath(ok)).toBe(ok);
    }
    for (const bad of [".github/workflows/evil.yml", ".github/focus-notes/x.js", ".github/focus-notes/a/b.mjs", "package.json", ".gitattributes", ".github/CODEOWNERS"]) {
      expect(() => checkManagedPath(bad), bad).toThrow(/isn't a template-managed file/);
    }
  });

  it("flags a change to the update script in the pull request", () => {
    const body = prBody({ from: "1.0.0", version: "1.1.0", write: [PIN, ".github/focus-notes/update.mjs"], manual: [], hashes: {} });
    expect(body).toMatch(/\*\*Review closely:\*\* this changes the update script itself/);
    expect(prBody({ from: "1.0.0", version: "1.1.0", write: [PIN], manual: [], hashes: {} })).not.toMatch(/Review closely/);
  });
});

describe("#3: a new release waits 3 days unless the owner asks", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  const rel = (tag, published_at) => ({ tag_name: tag, draft: false, published_at, assets: [`focus-notes-web-${tag.slice(1)}.tgz`, `focus-notes-workspace-${tag.slice(1)}.tgz`, "SHA256SUMS"].map((name) => ({ name })) });
  const releases = [rel("v1.2.0", "2026-11-08T00:00:00Z"), rel("v1.1.0", "2026-11-06T23:59:59Z"), rel("v1.0.0", null)];
  it("takes the newest release published at least 3 days ago", () => {
    expect(pickLatest(releases, { now })).toBe("1.1.0");
  });
  it("takes the newest at once when the run's skip-wait input is ticked", () => {
    expect(pickLatest(releases, { now, skipWait: true })).toBe("1.2.0");
    expect(update.wf.on.workflow_dispatch.inputs["skip-wait"]).toMatchObject({ type: "boolean", default: false });
    const find = update.wf.jobs.check.steps.find((s) => /Find the latest/.test(s.name ?? ""));
    expect(find.env.SKIP_WAIT).toBe("${{ inputs.skip-wait }}");
  });
  it("documents the kill switch: deleting a release makes deploys fail safe", () => {
    expect(update.text).toMatch(/Kill switch: deleting a release/);
  });
});

describe("#10: attestations name the exact signing identity, on GitHub-hosted runners", () => {
  it("update.yml and pages.yml verify with --cert-identity, --source-ref and --deny-self-hosted-runners", () => {
    const attest = update.wf.jobs.check.steps.find((s) => /attestations/.test(s.name ?? "")).run;
    expect(attest).toContain(`gh attestation verify "$RUNNER_TEMP/release/$f" --repo "$FOCUS_NOTES_SOURCE" ${IDENTITY} --source-ref "refs/tags/v$VERSION" --deny-self-hosted-runners`);
    const deploy = pages.wf.jobs.build.steps.find((s) => /attestation/.test(s.name ?? "")).run;
    expect(deploy).toBe(`gh attestation verify "$RUNNER_TEMP/bundle.tgz" --repo "$FOCUS_NOTES_SOURCE" ${IDENTITY.replaceAll("$VERSION", "$FOCUS_NOTES_VERSION")} --source-ref "refs/tags/v$FOCUS_NOTES_VERSION" --deny-self-hosted-runners`);
  });
  it("publish-template.mjs verifies the same way", () => {
    expect(verifyArgs("f.tgz", "1.2.3")).toEqual([
      "attestation", "verify", "f.tgz", "--repo", "prabinpebam/focus-notes",
      "--cert-identity", "https://github.com/prabinpebam/focus-notes/.github/workflows/release.yml@refs/tags/v1.2.3",
      "--source-ref", "refs/tags/v1.2.3", "--deny-self-hosted-runners",
    ]);
  });
});

describe("#7: SHA256SUMS names each expected file exactly once", () => {
  it("the check counts each name on its own", () => {
    const run = update.wf.jobs.check.steps.find((s) => /SHA-256/.test(s.name ?? "")).run;
    expect(run).toMatch(/for f in "focus-notes-web-\$VERSION\.tgz" "focus-notes-workspace-\$VERSION\.tgz"; do/);
    expect(run).toContain(`test "$(awk -v n="$f" '$2 == n' SHA256SUMS | wc -l)" -eq 1`);
    expect(run).toContain("sha256sum --check --strict checked.sums");
  });
  it("the update plans straight from the archive; nothing is unpacked", () => {
    const plan = update.wf.jobs.check.steps.find((s) => /Plan the update/.test(s.name ?? "")).run;
    expect(plan).not.toMatch(/tar /);
    expect(plan).toContain('--template "$RUNNER_TEMP/release/focus-notes-workspace-$VERSION.tgz"');
  });
});

describe("#8: one bot branch, checked before it moves", () => {
  const tip = (login, parents = 1) => ({ author: { login }, parents: Array.from({ length: parents }, () => ({ sha: "p" })) });
  it("moves only a branch whose tip the bot made, on one parent that's on the default branch", () => {
    expect(BOT).toBe("github-actions[bot]");
    expect(botBranchOk({ tip: tip(BOT), compareStatus: "behind" })).toEqual({ ok: true });
    expect(botBranchOk({ tip: tip(BOT), compareStatus: "identical" })).toEqual({ ok: true });
    expect(botBranchOk({ tip: tip("someone"), compareStatus: "behind" }).ok).toBe(false);
    expect(botBranchOk({ tip: tip(BOT, 2), compareStatus: "behind" }).ok).toBe(false);
    expect(botBranchOk({ tip: tip(BOT), compareStatus: "ahead" }).ok).toBe(false);
    expect(botBranchOk({ tip: tip(BOT), compareStatus: "diverged" }).reason).toMatch(new RegExp(BRANCH));
  });
  it("skips a version whose pull request was closed, and reads either title", () => {
    expect(titleVersion(prTitle("1.2.3"))).toBe("1.2.3");
    expect(titleVersion(prTitle("1.2.3", true))).toBe("1.2.3");
    expect(titleVersion("Something")).toBeNull();
    expect(decide({ version: "1.2.3", open: [], closed: [{ number: 4, title: prTitle("1.2.3", true), head: { ref: BRANCH } }] })).toEqual({ action: "none", number: 4, closed: true });
    expect(decide({ version: "1.2.4", open: [], closed: [{ number: 4, title: prTitle("1.2.3"), head: { ref: BRANCH } }] })).toEqual({ action: "create" });
  });
  it("falls back to creating the branch only on HTTP 404 or 422", () => {
    const script = readFileSync(join(tpl, ".github", "focus-notes", "update.mjs"), "utf8");
    expect(script).toMatch(/\[404, 422\]\.includes\(e\.status\)/);
    expect(script).not.toMatch(/catch \{\s*await api\("\/git\/refs"/);
  });
});

describe("#9: workflow files to copy by hand are flagged, with their expected SHA-256", () => {
  const files = (o) => (p) => (p in o ? Buffer.from(o[p]) : null);
  const manifest = JSON.stringify({ managed: [PIN, ".github/workflows/pages.yml"] });
  const pin = { version: "1.2.3", sha256: SHA, workflows: { ".github/workflows/pages.yml": sha("new wf") } };
  const next = files({ [PIN]: JSON.stringify(pin), ".focus-notes/managed.json": manifest, ".github/workflows/pages.yml": "new wf" });
  const current = (p) => (p === ".github/workflows/pages.yml" ? Buffer.from("old wf") : null);
  it("plans the hashes, says action needed in the title, and lists each hash in the body", () => {
    const plan = planUpdate({ version: "1.2.3", bundleSha256: SHA, readNext: next, readCurrent: current });
    expect(plan).toEqual({ version: "1.2.3", write: [PIN], manual: [".github/workflows/pages.yml"], hashes: { ".github/workflows/pages.yml": sha("new wf") } });
    expect(prTitle("1.2.3", true)).toBe("Update Focus Notes to 1.2.3 (action needed)");
    expect(prBody({ from: "1.2.2", ...plan })).toContain(`- \`.github/workflows/pages.yml\`, SHA-256 \`${sha("new wf")}\``);
  });
  it("app.json may record workflow hashes, and only for workflow files", () => {
    expect(readPin(JSON.stringify(pin)).workflows).toEqual(pin.workflows);
    expect(() => readPin(JSON.stringify({ ...pin, workflows: { "README.md": SHA } }))).toThrow(/workflow/);
    expect(() => readPin(JSON.stringify({ ...pin, workflows: { ".github/workflows/pages.yml": "x" } }))).toThrow(/SHA-256/);
  });
  it("pages.yml warns when its own SHA-256 differs from the one app.json records", () => {
    const read = pages.wf.jobs.build.steps.find((s) => /Read the pinned release/.test(s.name ?? "")).run;
    expect(read).toContain(`jq -r '.workflows[".github/workflows/pages.yml"] // empty' .focus-notes/app.json`);
    expect(read).toContain("sha256sum .github/workflows/pages.yml");
    expect(read).toMatch(/::warning::/);
  });
});

describe("#11: a minimum version", () => {
  it("pages.yml refuses a pin below FOCUS_NOTES_MIN_VERSION", () => {
    expect(pages.wf.env.FOCUS_NOTES_MIN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    const read = pages.wf.jobs.build.steps.find((s) => /Read the pinned release/.test(s.name ?? "")).run;
    expect(read).toContain("sort -V");
    expect(read).toMatch(/FOCUS_NOTES_MIN_VERSION[\s\S]*exit 1/);
  });
});

describe("#2: attestations only for approved releases", () => {
  it("release.yml's attest job runs in the release environment, and skips dry runs", () => {
    const { attest, release } = releaseWf.wf.jobs;
    expect(attest.environment).toBe("release");
    expect(release.environment).toBe("release");
    expect(attest.if).toBe("needs.version.outputs.dry-run == 'false'");
  });
});

describe("#1, #12: publishing the template", () => {
  it("only to the template repository, or its named test repository", () => {
    expect(checkRepo("prabinpebam/focus-notes-workspace")).toBe("prabinpebam/focus-notes-workspace");
    expect(checkRepo("prabinpebam/focus-notes-workspace-test")).toBe("prabinpebam/focus-notes-workspace-test");
    for (const bad of ["prabinpebam/focus-notes", "someone/focus-notes-workspace", ""]) expect(() => checkRepo(bad), bad).toThrow(/template repository/);
  });
  it("never an older version than the newest plain release, unless --allow-older", () => {
    const list = [{ tagName: "preview", isDraft: false }, { tagName: "v1.3.0", isDraft: true }, { tagName: "v1.2.0", isDraft: false }, { tagName: "v1.1.0", isDraft: false }];
    expect(() => checkNotOlder("1.1.0", list, false)).toThrow(/older than 1\.2\.0/);
    expect(() => checkNotOlder("1.1.0", list, true)).not.toThrow();
    expect(() => checkNotOlder("1.2.0", list, false)).not.toThrow();
  });
  it("commits from a separate staging folder through the clone's git dir, with no hooks and no fsmonitor", () => {
    expect(gitArgs({ clone: "C", staging: "S", hooks: "H" }, "add", "--all")).toEqual([
      "-c", "core.hooksPath=H", "-c", "core.fsmonitor=false", "-c", "core.autocrlf=false", "--git-dir=C/.git", "--work-tree=S", "add", "--all",
    ]);
    const script = readFileSync(join(root, "tools", "release", "publish-template.mjs"), "utf8");
    expect(script).not.toMatch(/"tar"/);
    expect(script).toMatch(/readTgz/);
  });
});

describe("#13: without permission to open pull requests, the branch and a compare link", () => {
  it("links the comparison for a pull request opened by hand, and documents the trade-off", () => {
    expect(compareLink("me/notes", "main")).toBe("https://github.com/me/notes/compare/main...focus-notes/update?expand=1");
    const script = readFileSync(join(tpl, ".github", "focus-notes", "update.mjs"), "utf8");
    expect(script).toMatch(/GITHUB_STEP_SUMMARY/);
    expect(update.text).toMatch(/Trade-off:/);
    expect(readFileSync(join(tpl, "README.md"), "utf8")).toMatch(/trade-off/i);
  });
});
