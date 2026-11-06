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

describe("D-255: Windows web journeys do not serialize the desktop gate", () => {
  it("runs the unchanged web commands independently on every CI invocation", () => {
    const web = workflow.jobs["web-windows"];
    expect(web).toBeDefined();
    expect(web["runs-on"]).toBe("windows-latest");
    expect(web.needs).toBeUndefined();
    expect(web.if).toBeUndefined();
    const commands = web.steps.filter((step) => step.run).map((step) => step.run.trim());
    expect(commands).toEqual([
      "pnpm install --frozen-lockfile",
      "node packages/tokens/build.mjs",
      "pnpm --filter @focus-notes/web exec playwright install chromium\npnpm test:web",
    ]);
    expect(web.steps.find((step) => step.name === "Web app journeys (Chromium)").if)
      .toBe("${{ !cancelled() && runner.os == 'Windows' }}");
    const setup = web.steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
    expect(setup.with).toEqual({ "node-version-file": ".nvmrc", cache: "pnpm" });
    const results = web.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(results.if).toBe("failure()");
    expect(results.with).toEqual({ name: "web-test-results-windows", path: "test-results/web" });
    expect(workflow.jobs.test.steps.some((step) => step.name === "Web app journeys (Chromium)")).toBe(false);
    expect(workflow.jobs.test.steps.find((step) => step.name === "Web app journeys (Chromium, Linux)")).toBeDefined();
    expect(workflow.jobs.test.steps.find((step) => step.name === "Budgets (QLT-05)").run).toBe("pnpm bench --check");
  });
});
