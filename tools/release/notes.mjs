#!/usr/bin/env node
/**
 * Release notes from the commits merged since the last release tag (DST-03, D-128):
 *
 *   node tools/release/notes.mjs --tag v1.2.3 [--ref HEAD] [--repository owner/name]
 *
 * prints Markdown: every commit since the previous `v<x.y.z>` tag (dry-run tags don't count), oldest
 * last, then how to check what was downloaded. `--ref` is the commit the release is built from (the
 * tag itself when it exists; HEAD on a dry run, whose tag is never created).
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** The release tag before `ref`, or null for the first release. */
export function previousTag(ref, cwd) {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "--exclude", "*-dryrun*", `${ref}^`], cwd) || null;
  } catch {
    return null;
  }
}

/** Commits in (previous, ref], newest first, without merge commits. */
export function commitsSince(previous, ref, cwd) {
  const out = git(["log", "--no-merges", "--format=%h%x09%s", previous ? `${previous}..${ref}` : ref], cwd);
  return out ? out.split("\n").map((l) => { const [sha, ...s] = l.split("\t"); return { sha, subject: s.join("\t") }; }) : [];
}

export function releaseNotes({ tag, previous, commits, repository = "prabinpebam/focus-notes" }) {
  const escape = (s) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
  return [
    previous ? `## Changes since ${previous}` : "## Changes",
    "",
    ...(commits.length ? commits.map((c) => `- ${escape(c.subject)} (${c.sha})`) : ["- No changes."]),
    "",
    "## Check your download",
    "",
    "Every file here is listed in `SHA256SUMS` and has a GitHub artifact attestation from this repository's release workflow, for this tag:",
    "",
    "```sh",
    "sha256sum --check --ignore-missing SHA256SUMS",
    `gh attestation verify <file> --repo ${repository} --signer-workflow ${repository}/.github/workflows/release.yml --source-ref refs/tags/${tag}`,
    "```",
    "",
    "The installers aren't code-signed yet (DSK-07): Windows SmartScreen and macOS Gatekeeper warn before the first start. Windows is the supported platform; the macOS and Linux builds are previews until the platform parity pass (D-112).",
    "",
    `\`focus-notes-web-${tag.slice(1)}.tgz\` is the web app bundle template instances deploy, and \`focus-notes-workspace-${tag.slice(1)}.tgz\` is the workspace template pinned to it.`,
    "",
  ].join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const rest = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const tag = arg("tag");
  if (!tag) { console.error("Usage: notes.mjs --tag v<x.y.z> [--ref <commit>] [--repository owner/name]"); process.exit(1); }
  const ref = arg("ref") ?? tag;
  const previous = previousTag(ref);
  process.stdout.write(releaseNotes({ tag, previous, commits: commitsSince(previous, ref), ...(arg("repository") ? { repository: arg("repository") } : {}) }));
}
