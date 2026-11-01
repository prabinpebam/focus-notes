import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import yaml from "js-yaml";

const root = resolve(import.meta.dirname, "..", "..");
const workflow = yaml.load(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8"));
const script = workflow.jobs.changes.steps.find((step) => step.id === "diff").run;
const prolog = script.slice(0, script.indexOf('files="$(git diff'));
const folder = mkdtempSync(join(tmpdir(), "fn-ci-diff-"));
const git = (...args) => execFileSync("git", args, { cwd: folder, encoding: "utf8" }).trim();
const commit = (subject) => {
  git("add", "-A");
  git("-c", "user.name=CI fixture", "-c", "user.email=ci@example.test", "commit", "-qm", subject);
  return git("rev-parse", "HEAD");
};
git("init", "-q", "-b", "main");
mkdirSync(join(folder, "packages"));
mkdirSync(join(folder, "documentations"));
writeFileSync(join(folder, "packages", "runtime.ts"), "export const value = 1;\n");
const base = commit("Base runtime");
git("update-ref", "refs/remotes/origin/main", base);
writeFileSync(join(folder, "packages", "runtime.ts"), "export const value = 2;\n");
const runtime = commit("Runtime change");
writeFileSync(join(folder, "documentations", "evidence.md"), "# Evidence\n");
commit("Evidence follow-up");
const bash = process.platform === "win32"
  ? resolve(dirname(git("--exec-path")), "..", "..", "bin", "bash.exe")
  : "bash";
const changed = (branch, before, baseRef = "") => execFileSync(bash,
  ["-c", `${prolog}\ngit diff --name-only "$base" HEAD`],
  { cwd: folder, encoding: "utf8", env: { ...process.env, GITHUB_REF_NAME: branch, BEFORE: before, BASE_REF: baseRef } })
  .trim().split(/\r?\n/);
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe("D-255: CI gates the exact unmerged candidate, including its evidence follow-up", () => {
  it("keeps runtime gates on for a work branch whose latest push changes only evidence", () => {
    expect(changed("fix-candidate", runtime)).toEqual(["documentations/evidence.md", "packages/runtime.ts"]);
  });
  it("keeps a main documentation-only push on its fast checks", () => {
    expect(changed("main", runtime)).toEqual(["documentations/evidence.md"]);
  });
  it("uses the pull request base for the entire candidate", () => {
    expect(changed("fix-candidate", runtime, "main")).toEqual(["documentations/evidence.md", "packages/runtime.ts"]);
  });
  it("gates the entire candidate on its first branch push", () => {
    expect(changed("fix-candidate", "0".repeat(40))).toEqual(["documentations/evidence.md", "packages/runtime.ts"]);
  });
});
