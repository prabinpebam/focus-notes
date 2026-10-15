#!/usr/bin/env node
/**
 * Downloads a branch's latest review captures from CI (D-146): the artifact the Review captures
 * workflow uploads (every window size, light and dark), into
 * E:\Projects\side-projects\fre-review\<label>\ (beside the repository; FOCUS_NOTES_REVIEW_ROOT
 * overrides the folder).
 *
 *   node tools/review/fetch-captures.mjs [--branch vq-fre-polish] [--catalog fre-catalog] [--label polish-2] [--run 123]
 *
 * The branch defaults to the current one, the catalogue to fre-catalog, the run to the branch's
 * latest finished run of the workflow, and the label to `<branch>-<commit>`. Needs the GitHub CLI
 * (`gh`), signed in. Never overwrites a folder that has files in it.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactName, catalog } from "./catalogs.mjs";

export const WORKFLOW = "review-captures.yml";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The review folder: FOCUS_NOTES_REVIEW_ROOT, or fre-review beside the repository (or worktree). */
export const reviewRoot = (env = process.env, repo = root) => env.FOCUS_NOTES_REVIEW_ROOT || resolve(repo, "..", "fre-review");

/** A folder name from a branch and commit: letters, digits, dots, dashes and underscores. */
export const labelFor = (branch, sha) => `${branch}-${sha.slice(0, 7)}`.replace(/[^\w.-]+/g, "-");

/** The latest finished run in `gh run list --json databaseId,headSha,status,conclusion` output. */
export function pickRun(runs) {
  const done = runs.filter((r) => r.status === "completed" && r.conclusion !== "cancelled" && r.conclusion !== "skipped");
  if (!done.length) throw new Error("No finished run of the Review captures workflow on this branch yet: start one with gh workflow run review-captures.yml --ref <branch>.");
  return done[0];
}

/** The `gh` arguments: list the branch's runs, and download one run's artifact into a folder. */
export const listArgs = (branch) => ["run", "list", "--workflow", WORKFLOW, "--branch", branch, "--limit", "20", "--json", "databaseId,headSha,status,conclusion,createdAt"];
export const downloadArgs = (run, name, dest) => ["run", "download", String(run), "--name", artifactName(name), "--dir", dest];

function main(argv) {
  const opt = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const gh = (args) => execFileSync("gh", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const name = opt("--catalog") ?? "fre-catalog";
  catalog(name);
  const branch = opt("--branch") ?? execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  let run = opt("--run");
  let sha = "";
  let conclusion = "";
  if (!run) {
    const r = pickRun(JSON.parse(gh(listArgs(branch))));
    ({ databaseId: run, headSha: sha, conclusion } = r);
  }
  const label = opt("--label") ?? labelFor(branch, sha || String(run));
  if (!/^[\w.-]+$/.test(label)) throw new Error(`The label "${label}" may only have letters, digits, dots, dashes and underscores.`);
  const dest = join(reviewRoot(), label);
  if (existsSync(dest) && readdirSync(dest).length) throw new Error(`${dest} already has files in it: choose another --label.`);
  gh(downloadArgs(run, name, dest));
  const images = readdirSync(dest).filter((f) => f.endsWith(".png")).length;
  console.log(`Run ${run}${sha ? ` (${sha.slice(0, 7)}, ${conclusion})` : ""}: ${images} images in ${dest}${existsSync(join(dest, "index.html")) ? `; open ${join(dest, "index.html")}` : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
