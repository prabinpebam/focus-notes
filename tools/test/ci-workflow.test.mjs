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

describe("D-268: macOS reports independently of the Windows merge gate", () => {
    const report = workflow.jobs["macos-report"];
    it("keeps the required matrix and Windows shards Windows-only", () => {
      expect(workflow.jobs.test.strategy.matrix.os).toEqual(["windows-latest"]);
      expect(workflow.jobs["journeys-windows"]["runs-on"]).toBe("windows-latest");
      for (const [name, job] of Object.entries(workflow.jobs)) {
        if (name !== "macos-report") {
          expect([job.needs].flat()).not.toContain("macos-report");
        }
      }
    });
    it("runs macOS arm64 as an explicitly non-gating desktop report", () => {
      expect(report["runs-on"]).toBe("macos-latest");
      expect(report["continue-on-error"]).toBe(true);
      expect(report.needs).toBe("changes");
      expect(report.if).toBe("needs.changes.outputs.desktop == 'true'");
      const architecture = report.steps.find(step => step.name?.startsWith("Verify runner"));
      expect(architecture.run).toContain('test "$(uname -m)" = "arm64"');
      expect(architecture.run).toContain("process.arch !== 'arm64'");
    });
    it("verifies the proxy before setup/cache/install and guards native code before execution", () => {
      expect(report.env.npm_config_registry).toBe("https://packagefeedproxy.microsoft.io/npm/");
      const source = report.steps.findIndex(step => step.name === "Verify approved package source");
      const setup = report.steps.findIndex(step => step.uses?.startsWith("pnpm/action-setup@"));
      const install = report.steps.findIndex(step => step.run === "pnpm install --frozen-lockfile");
      expect(source).toBeLessThan(setup);
      expect(setup).toBeLessThan(install);
      expect(report.steps.find(step => step.id === "native").run).toContain("copilot-sdk-platform");
      for (const id of ["units", "electron"]) {
        expect(report.steps.find(step => step.id === id).if).toContain("steps.native.outcome == 'success'");
      }
      expect(report.steps.find(step => step.id === "journeys").run).toContain("--trace=retain-on-failure");
      expect(report.env.FOCUS_NOTES_E2E_ALLOW_SCREEN).toBe("1");
      expect(report.env.FOCUS_NOTES_LIVE_AI).toBe("0");
    });
    it("always preserves diagnostics and distinguishes skipped checks from passing evidence", () => {
      const upload = report.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
      expect(upload.if).toBe("always()");
      expect(upload.with.path).toBe("test-results/");
      expect(upload.with.name).toBe("test-results-macos-arm64");
      const summary = report.steps.find(step => step.name === "Report actual outcomes");
      expect(summary.if).toBe("always()");
      expect(summary.run).toContain("Skipped journeys are not passing evidence");
    });
    it("rejects native dependency and bundled-import fixtures but permits an absent payload", () => {
      const guard = report.steps.find(step => step.id === "native").run.match(/<<'NODE'[^\n]*\n([\s\S]*)\nNODE/)[1];
      const fixture = (dependency, contents = "export const safe = true;") => {
        const cwd = mkdtempSync(join(folder, "native-guard-"));
        mkdirSync(join(cwd, "node_modules", ".pnpm"), { recursive: true });
        mkdirSync(join(cwd, "apps", "desktop", "out", "main"), { recursive: true });
        if (dependency) mkdirSync(join(cwd, "node_modules", ".pnpm", dependency));
        writeFileSync(join(cwd, "apps", "desktop", "out", "main", "main.mjs"), contents);
        return () => execFileSync(process.execPath, ["--input-type=module", "-e", guard],
          { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      };
      expect(fixture()()).toContain("Native SDK absence verified");
      for (const dependency of ["@github+copilot-sdk-platform-darwin-arm64@1.0.28", "koffi@3.2.1", "@koromix+koffi-darwin-arm64@3.2.1"]) {
        expect(fixture(dependency)).toThrow();
      }
      expect(fixture(undefined, 'import koffi from "koffi";')).toThrow();
      expect(fixture(undefined, 'const payload = "OneAuth";')).toThrow();
    });
});
