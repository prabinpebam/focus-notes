#!/usr/bin/env node
/**
 * Publish the template repository from a published release (DST-06, D-135), with your own gh login:
 *
 *   node tools/release/publish-template.mjs --version <x.y.z> [--repo prabinpebam/focus-notes-workspace] [--dry-run]
 *
 * Downloads focus-notes-workspace-<version>.tgz and SHA256SUMS from the published (not draft)
 * release v<version>, checks the SHA-256 and the attestation made by release.yml for exactly that
 * tag, then makes the template repository's default branch hold exactly the template's files, in one
 * commit, and pushes it. It's run by hand after publishing a release, so no workflow holds a token
 * that can write to another repository (PKG-04). --dry-run does everything but the push.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Of, templateName } from "./template.mjs";

export const SOURCE = "prabinpebam/focus-notes";
export const TEMPLATE_REPO = "prabinpebam/focus-notes-workspace";

/** Only a plain release version: no preview, dry run or other suffix. */
export function checkVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error(`Not a release version: ${version}`);
  return version;
}

/** The SHA-256 SHA256SUMS gives `name`; throws unless there's exactly one. */
export function sumFor(sums, name) {
  const hits = sums.split("\n").map((l) => /^([0-9a-f]{64}) [ *](.+)$/.exec(l.trimEnd())).filter((m) => m && m[2] === name);
  if (hits.length !== 1) throw new Error(`SHA256SUMS has ${hits.length} lines for ${name}`);
  return hits[0][1];
}

/** The attestation check, as the template's workflows run it: this workflow, this exact tag. */
export const verifyArgs = (file, version) => [
  "attestation", "verify", file, "--repo", SOURCE,
  "--signer-workflow", `${SOURCE}/.github/workflows/release.yml`, "--source-ref", `refs/tags/v${checkVersion(version)}`,
];

export const commitMessage = (version) => `Focus Notes ${version}: the template pinned to focus-notes-web-${version}.tgz`;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });

export function publish({ version, repo = TEMPLATE_REPO, dryRun = false }) {
  checkVersion(version);
  const tag = `v${version}`;
  const release = JSON.parse(run("gh", ["release", "view", tag, "--repo", SOURCE, "--json", "isDraft,tagName"]));
  if (release.isDraft || release.tagName !== tag) throw new Error(`${tag} isn't a published release`);
  const dir = mkdtempSync(join(tmpdir(), "fn-publish-template-"));
  try {
    const name = templateName(version);
    run("gh", ["release", "download", tag, "--repo", SOURCE, "--dir", dir, "--pattern", name, "--pattern", "SHA256SUMS"]);
    const file = join(dir, name);
    if (sha256Of(file) !== sumFor(readFileSync(join(dir, "SHA256SUMS"), "utf8"), name)) throw new Error(`${name} doesn't match SHA256SUMS`);
    run("gh", verifyArgs(file, version), { stdio: ["ignore", "inherit", "inherit"] });
    const work = join(dir, "repo");
    run("gh", ["repo", "clone", repo, work, "--", "--depth", "1"]);
    // Exactly the template's files: everything but .git goes, then the archive is unpacked.
    for (const f of readdirSync(work)) if (f !== ".git") rmSync(join(work, f), { recursive: true, force: true });
    run("tar", ["-xzf", join("..", name)], { cwd: work });
    run("git", ["add", "--all"], { cwd: work });
    if (!run("git", ["status", "--porcelain"], { cwd: work }).trim()) return console.log(`${repo} already holds the ${version} template.`);
    run("git", ["commit", "--quiet", "-m", commitMessage(version)], { cwd: work });
    if (dryRun) return console.log(`Dry run: committed ${commitMessage(version)} in ${work}, not pushed.`);
    run("git", ["push", "origin", "HEAD"], { cwd: work, stdio: ["ignore", "inherit", "inherit"] });
    console.log(`Pushed the ${version} template to ${repo}.`);
  } finally {
    if (!dryRun) rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    publish({ version: arg("version"), repo: arg("repo") ?? TEMPLATE_REPO, dryRun: rest.includes("--dry-run") });
  } catch (e) {
    console.error(`publish-template: ${e.message}`);
    process.exit(1);
  }
}
