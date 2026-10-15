#!/usr/bin/env node
/**
 * Publish the template repository from a published release (DST-06, D-137), with your own gh login:
 *
 *   node tools/release/publish-template.mjs --version <x.y.z> [--repo <template repo>] [--allow-older] [--dry-run]
 *
 * Downloads focus-notes-workspace-<version>.tgz and SHA256SUMS from the published (not draft)
 * release v<version>, checks the SHA-256 (named exactly once) and the attestation made by release.yml
 * for exactly that tag on a GitHub-hosted runner, reads the archive in memory (refusing links, .git
 * and any path that isn't plain), writes its files into a fresh staging folder, and commits that
 * folder as the template repository's whole tree through the clone's git directory, with no hooks
 * and no fsmonitor. The clone's own working tree is never checked out or written. It's run by hand
 * after publishing a release, so no workflow holds a token that can write to another repository
 * (PKG-04). --dry-run does everything but the push.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256Of, templateName } from "./template.mjs";
import { compareVersions, readTgz } from "../../templates/workspace/.github/focus-notes/update.mjs";

export const SOURCE = "prabinpebam/focus-notes";
export const TEMPLATE_REPO = "prabinpebam/focus-notes-workspace";
/** The only repositories this pushes to: the template, and a named one for trying it out. */
export const REPOS = [TEMPLATE_REPO, `${TEMPLATE_REPO}-test`];

/** Only a plain release version: no preview, dry run or other suffix. */
export function checkVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error(`Not a release version: ${version}`);
  return version;
}

export function checkRepo(repo) {
  if (!REPOS.includes(repo)) throw new Error(`Only the template repository (${REPOS.join(" or ")}), not ${JSON.stringify(repo)}`);
  return repo;
}

/** Refuses a version older than the newest published plain release, unless allowed. */
export function checkNotOlder(version, releases, allowOlder) {
  const plain = releases.filter((r) => !r.isDraft && /^v\d+\.\d+\.\d+$/.test(r.tagName)).map((r) => r.tagName.slice(1));
  const newest = plain.reduce((a, b) => (a && compareVersions(a, b) >= 0 ? a : b), null);
  if (newest && compareVersions(version, newest) < 0 && !allowOlder) throw new Error(`${version} is older than ${newest}; pass --allow-older to publish it anyway`);
}

/** The SHA-256 SHA256SUMS gives `name`; throws unless there's exactly one. */
export function sumFor(sums, name) {
  const hits = sums.split("\n").map((l) => /^([0-9a-f]{64}) [ *](.+)$/.exec(l.trimEnd())).filter((m) => m && m[2] === name);
  if (hits.length !== 1) throw new Error(`SHA256SUMS has ${hits.length} lines for ${name}`);
  return hits[0][1];
}

/** The attestation check, as the template's workflows run it: this workflow, this exact tag, a hosted runner. */
export const verifyArgs = (file, version) => [
  "attestation", "verify", file, "--repo", SOURCE,
  "--cert-identity", `https://github.com/${SOURCE}/.github/workflows/release.yml@refs/tags/v${checkVersion(version)}`,
  "--source-ref", `refs/tags/v${version}`, "--deny-self-hosted-runners",
];

/** Git run on the clone's history with the staging folder as its working tree, and no hooks. */
export const gitArgs = ({ clone, staging, hooks }, ...args) => [
  "-c", `core.hooksPath=${hooks}`, "-c", "core.fsmonitor=false", "-c", "core.autocrlf=false", `--git-dir=${clone}/.git`, `--work-tree=${staging}`, ...args,
];

export const commitMessage = (version) => `Focus Notes ${version}: the template pinned to focus-notes-web-${version}.tgz`;

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...opts });

export function publish({ version, repo = TEMPLATE_REPO, allowOlder = false, dryRun = false }) {
  checkVersion(version);
  checkRepo(repo);
  const tag = `v${version}`;
  const release = JSON.parse(run("gh", ["release", "view", tag, "--repo", SOURCE, "--json", "isDraft,tagName"]));
  if (release.isDraft || release.tagName !== tag) throw new Error(`${tag} isn't a published release`);
  checkNotOlder(version, JSON.parse(run("gh", ["release", "list", "--repo", SOURCE, "--limit", "100", "--json", "tagName,isDraft"])), allowOlder);
  const dir = mkdtempSync(join(tmpdir(), "fn-publish-template-"));
  try {
    const name = templateName(version);
    run("gh", ["release", "download", tag, "--repo", SOURCE, "--dir", dir, "--pattern", name, "--pattern", "SHA256SUMS"]);
    const file = join(dir, name);
    if (sha256Of(file) !== sumFor(readFileSync(join(dir, "SHA256SUMS"), "utf8"), name)) throw new Error(`${name} doesn't match SHA256SUMS`);
    run("gh", verifyArgs(file, version), { stdio: ["ignore", "inherit", "inherit"] });
    const files = readTgz(readFileSync(file));
    const g = { clone: join(dir, "clone"), staging: join(dir, "staging"), hooks: join(dir, "no-hooks") };
    mkdirSync(g.hooks);
    for (const [p, data] of files) {
      const to = join(g.staging, ...p.split("/"));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, data);
    }
    run("gh", ["repo", "clone", repo, g.clone, "--", "--depth", "1", "--no-checkout"]);
    // With nothing checked out the index starts empty, so adding the staging folder makes the commit
    // hold exactly the template's files.
    run("git", gitArgs(g, "add", "--all"));
    if (!run("git", gitArgs(g, "status", "--porcelain")).trim()) return console.log(`${repo} already holds the ${version} template.`);
    run("git", gitArgs(g, "commit", "--quiet", "-m", commitMessage(version)));
    if (dryRun) return console.log(`Dry run: committed ${commitMessage(version)} in ${g.clone}, not pushed.`);
    run("git", gitArgs(g, "push", "origin", "HEAD"), { stdio: ["ignore", "inherit", "inherit"] });
    console.log(`Pushed the ${version} template to ${repo}.`);
  } finally {
    if (!dryRun) rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (n) => { const i = rest.indexOf(`--${n}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    publish({ version: arg("version"), repo: arg("repo") ?? TEMPLATE_REPO, allowOlder: rest.includes("--allow-older"), dryRun: rest.includes("--dry-run") });
  } catch (e) {
    console.error(`publish-template: ${e.message}`);
    process.exit(1);
  }
}
