#!/usr/bin/env node
/**
 * What a release run builds (DST-03, D-126): its version, tag, whether it's a dry run, and whether
 * it's a pre-release. Run by release.yml's first job, which writes the result to $GITHUB_OUTPUT.
 *
 * - A pushed tag `v<x.y.z>` releases that version as a draft. Versions below 1.0.0 (stage exits,
 *   `v0.<stage>.<n>`) and versions with a suffix (`v1.2.0-beta.1`) are pre-releases.
 * - A tag with `-dryrun` in it, or a manual run with *dry run* ticked, builds, smoke-tests and attests
 *   everything without publishing anything.
 * - A manual run on a branch is always a dry run, versioned `<desktop version>-dryrun.<run number>`:
 *   releases come only from tags.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const TAG = /^v(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;

export function releaseVersion({ refType, refName, dryRunInput, packageVersion, runNumber }) {
  const dryRunAsked = dryRunInput === "true" || dryRunInput === true;
  if (refType === "tag") {
    const m = TAG.exec(refName);
    if (!m) throw new Error(`A release tag looks like v1.2.3 or v1.2.3-beta.1, not ${refName}`);
    const version = refName.slice(1);
    const dryRun = dryRunAsked || /-dryrun/.test(refName);
    return { version, tag: refName, dryRun, prerelease: m[1] === "0" || Boolean(m[4]) };
  }
  if (!dryRunAsked) throw new Error("Only a v<version> tag publishes a release; on a branch, run it as a dry run.");
  const version = `${packageVersion}-dryrun.${runNumber}`;
  return { version, tag: `v${version}`, dryRun: true, prerelease: true };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const packageVersion = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "apps", "desktop", "package.json"), "utf8")).version;
    const r = releaseVersion({
      refType: process.env.GITHUB_REF_TYPE, refName: process.env.GITHUB_REF_NAME,
      dryRunInput: process.env.DRY_RUN_INPUT, packageVersion, runNumber: process.env.GITHUB_RUN_NUMBER,
    });
    const lines = [`version=${r.version}`, `tag=${r.tag}`, `dry-run=${r.dryRun}`, `prerelease=${r.prerelease}`];
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
    console.log(lines.join("\n"));
  } catch (e) {
    console.log(`::error::${e.message}`);
    process.exit(1);
  }
}
