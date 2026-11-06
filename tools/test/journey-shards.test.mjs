import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { discoverSpecs, partitionSpecs, verifyCoverage, playwrightArgs, parseArgs, loadWeights } from "../ci/run-journey-shard.mjs";

const root = resolve(import.meta.dirname, "../..");
const desktop = join(root, "apps", "desktop");

describe("duration-aware whole-file journey shards", () => {
  it("assigns measured, zero-cost and unknown specs exactly once to four balanced bins", () => {
    const files = ["heavy.spec.ts", "a.spec.ts", "b.spec.ts", "unknown.spec.ts", "skipped.spec.ts"];
    const bins = partitionSpecs(files, { "heavy.spec.ts": 120, "a.spec.ts": 60, "b.spec.ts": 60, "skipped.spec.ts": 0 });
    expect(bins).toHaveLength(4);
    expect(() => verifyCoverage(files, bins)).not.toThrow();
    expect(bins.find(bin => bin.files.includes("unknown.spec.ts")).seconds).toBe(60);
    expect(bins.flatMap(bin => bin.files)).toContain("skipped.spec.ts");
    expect(Math.max(...bins.map(bin => bin.seconds))).toBe(120);
    expect(partitionSpecs([...files].reverse(), { "heavy.spec.ts": 120, "a.spec.ts": 60, "b.spec.ts": 60, "skipped.spec.ts": 0 })).toEqual(bins);
  });

  it("rejects omissions, duplicates, extra files and invalid timing data", () => {
    const bins = partitionSpecs(["a.spec.ts", "b.spec.ts"], {});
    expect(() => verifyCoverage(["a.spec.ts", "b.spec.ts", "c.spec.ts"], bins)).toThrow(/coverage/i);
    expect(() => verifyCoverage(["a.spec.ts"], bins)).toThrow(/coverage/i);
    expect(() => verifyCoverage(["a.spec.ts", "b.spec.ts"], bins.map((bin, i) => i === 0 ? { ...bin, files: [...bin.files, "a.spec.ts"] } : bin))).toThrow(/coverage/i);
    expect(() => partitionSpecs(["a.spec.ts", "a.spec.ts"], {})).toThrow(/duplicate/i);
    for (const seconds of [-1, NaN, Infinity, Number.MAX_VALUE, "20", null]) expect(() => partitionSpecs(["a.spec.ts"], { "a.spec.ts": seconds })).toThrow(/duration/i);
  });

  it("discovers new nested spec/test files but not helpers or dependency tests", () => {
    const dir = mkdtempSync(join(tmpdir(), "fn-shards-"));
    try {
      mkdirSync(join(dir, "nested"));
      mkdirSync(join(dir, "node_modules"));
      for (const name of ["old.spec.ts", "helper.ts", "nested/new.test.mjs", "nested/new.spec.tsx", "node_modules/foreign.spec.ts"]) writeFileSync(join(dir, name), "");
      expect(discoverSpecs(dir)).toEqual(["nested/new.spec.tsx", "nested/new.test.mjs", "old.spec.ts"]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("uses exact escaped file filters with no native re-sharding or parallel workers", () => {
    const args = playwrightArgs(["folder/a+b.spec.ts", "a.spec.ts"]);
    expect(args.slice(0, 3)).toEqual(["test", "--workers=1", "--retries=0"]);
    expect(args).not.toContain("--fully-parallel");
    expect(args.some(arg => arg.startsWith("--shard"))).toBe(false);
    const filter = new RegExp(args[3]);
    expect(filter.test("E:\\repo\\e2e\\folder\\a+b.spec.ts")).toBe(true);
    expect(filter.test("/repo/e2e/folder/a+b.spec.ts")).toBe(true);
    expect(filter.test("/repo/e2e/folder/axb.spec.ts")).toBe(false);
    expect(filter.test("/repo/e2e/folder/a+b.spec.ts-extra")).toBe(false);
  });

  it("requires one of four shards or a check and rejects option injection", () => {
    expect(parseArgs(["--shard=4/4"])).toEqual({ shard: 4, check: false });
    expect(parseArgs(["--check"])).toEqual({ check: true });
    for (const args of [[], ["--shard=0/4"], ["--shard=1/5"], ["--shard=1/4", "--workers=2"], ["--check", "--shard=1/4"]]) expect(() => parseArgs(args)).toThrow(/Usage/);
  });

  it("matches Playwright's complete current cases exactly once, including zero-cost files", { timeout: 30_000 }, () => {
    const files = discoverSpecs(join(desktop, "e2e"));
    const bins = partitionSpecs(files, loadWeights());
    verifyCoverage(files, bins);
    const cli = createRequire(join(desktop, "package.json")).resolve("@playwright/test/cli");
    const list = args => JSON.parse(execFileSync(process.execPath, [cli, ...args, "--list", "--reporter=json"], { cwd: desktop, encoding: "utf8", env: { ...process.env, CI: "1" }, maxBuffer: 10 * 1024 * 1024 }));
    const cases = suites => suites.flatMap(suite => [...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => `${spec.id}:${test.projectId}`)), ...cases(suite.suites ?? [])]);
    const all = list(["test"]);
    const selected = bins.flatMap(bin => bin.files.length ? cases(list(playwrightArgs(bin.files)).suites) : []);
    const expected = cases(all.suites);
    expect(expected.length).toBeGreaterThan(400);
    expect(new Set(selected).size).toBe(selected.length);
    expect([...selected].sort()).toEqual([...expected].sort());
    expect(all.config.fullyParallel).toBe(false);
    expect(all.config.shard).toBeNull();
    expect(all.config.workers).toBe(1);
    expect(all.config.projects.every(project => project.retries === 0)).toBe(true);
  });

  it("keeps the workflow at four isolated VMs and calls the checked runner", () => {
    const workflow = yaml.load(readFileSync(join(root, ".github", "workflows", "ci.yml"), "utf8"));
    const job = workflow.jobs["journeys-windows"];
    expect(job.strategy.matrix.shard).toEqual([1, 2, 3, 4]);
    const step = job.steps.find(step => step.name?.startsWith("Journey tests (shard"));
    expect(step["working-directory"]).toBe("apps/desktop");
    expect(step.run).toBe("node ../../tools/ci/run-journey-shard.mjs --shard=${{ matrix.shard }}/4");
    expect(workflow.jobs.changes.steps.find(step => step.id === "diff").run).toContain("tools/(release|bench|dev|ci)/");
  });
});
