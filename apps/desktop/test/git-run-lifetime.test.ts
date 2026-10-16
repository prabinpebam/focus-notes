/**
 * Git's worker thread (D-151 (5)) keeps a process running only while a command is under way (QLT-05):
 * ref'd for good, the bench's Node process never exited after its report on CI (an hour, cancelled);
 * unref'd for good, a Node process exited with a command still running.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const run = pathToFileURL(join(import.meta.dirname, "..", "src", "main", "git", "run.ts")).href;
/** A Node process that runs Git through the runner, with nothing else to keep it running. */
const node = (script: string) => {
  // A module file, as the bench is (with node -e the hang didn't show).
  const file = join(mkdtempSync(join(tmpdir(), "fn-git-run-")), "probe.mjs");
  writeFileSync(file, script);
  return spawnSync(process.execPath, [file], { encoding: "utf8", timeout: 20_000 });
};

describe("QLT-05: the Git worker never holds a process open, and never lets it end mid-command", () => {
  it("a Node process that ran Git exits on its own once the answers are in", () => {
    const r = node(`
      const { createRunner } = await import(${JSON.stringify(run)});
      const git = createRunner();
      const [a, b] = await Promise.all([git({ cwd: process.cwd(), args: ["--version"] }), git({ cwd: process.cwd(), args: ["--version"] })]);
      const c = await git({ cwd: process.cwd(), args: ["--version"] });
      console.log([a, b, c].map((x) => x.code).join(","), c.stdout.trim());
    `);
    expect(r.error, "the process was still running after 20 s").toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^0,0,0 git version/);
  }, 30_000);
});
