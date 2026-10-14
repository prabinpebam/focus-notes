/**
 * Repository-level requirements of M0 (WP-0.1, WP-0.3), proven from what's checked in: the license,
 * the supply chain, the security policy, CI's test stages, the budgets file, the Slate host, and the
 * token tier rules. Each check names its requirement so `pnpm trace` finds it.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import yaml from "js-yaml";

const root = join(import.meta.dirname, "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const workflows = () => readdirSync(join(root, ".github", "workflows")).filter((f) => f.endsWith(".yml"));
const ci = () => yaml.load(read(".github/workflows/ci.yml"));
const ciRuns = () => Object.values(ci().jobs).flatMap((j) => j.steps ?? []).map((s) => s.run ?? "").join("\n");
const node = (...args) => execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });

describe("the product repository", () => {
  it("PKG-01: holds the app's source, docs, and the instance template", () => {
    for (const p of ["apps/desktop", "apps/web", "packages", "documentations", "templates/workspace/AGENTS.md"]) expect(existsSync(join(root, p)), p).toBe(true);
  });

  it("PKG-04: CI builds and tests with no secrets or user workspace", () => {
    expect(read(".github/workflows/ci.yml")).not.toMatch(/secrets\./);
  });

  it("PKG-06: nothing hosted or registered: no OAuth client ID, telemetry, or analytics in the source or dependencies", () => {
    const sources = (dir) => readdirSync(join(root, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && /\.(m?[jt]sx?|json)$/.test(e.name) && !join(e.parentPath, e.name).includes("node_modules"))
      .map((e) => join(e.parentPath, e.name));
    const files = [...["apps/desktop", "apps/web"].map((a) => `${a}/src`), ...readdirSync(join(root, "packages")).map((p) => `packages/${p}/src`)]
      .filter((d) => existsSync(join(root, d)))
      .flatMap(sources);
    files.push(join(root, "package.json"), ...["apps/desktop", "apps/web"].map((a) => join(root, a, "package.json")));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/\b(client_id|clientId|telemetry|sentry|posthog|analytics|applicationinsights)\b/i);
  });

  it("LIC-01: is MIT licensed", () => {
    expect(read("LICENSE")).toMatch(/^MIT License/);
    expect(JSON.parse(read("package.json")).license).toBe("MIT");
  });

  it("LIC-02: the license check and third-party notices pass, and CI runs them", { timeout: 30_000 }, () => {
    expect(() => node("tools/check-licenses.mjs")).not.toThrow();
    expect(() => node("tools/notices.mjs", "--check")).not.toThrow();
    expect(JSON.parse(read("package.json")).scripts.check).toContain("check:licenses");
    expect(ciRuns()).toMatch(/pnpm check/);
  });
});

describe("supply chain and security policy", () => {
  it("SEC-04: a lockfile, Dependabot for npm and actions, CodeQL, and every action pinned by full SHA", () => {
    expect(existsSync(join(root, "pnpm-lock.yaml"))).toBe(true);
    expect(ciRuns()).toMatch(/--frozen-lockfile/);
    const ecosystems = yaml.load(read(".github/dependabot.yml")).updates.map((u) => u["package-ecosystem"]);
    expect(ecosystems).toEqual(expect.arrayContaining(["npm", "github-actions"]));
    expect(workflows()).toContain("codeql.yml");
    for (const f of workflows())
      for (const m of read(`.github/workflows/${f}`).matchAll(/uses:\s*([^\s#]+)/g))
        if (!m[1].startsWith("./")) expect(m[1], `${f}: ${m[1]}`).toMatch(/@[0-9a-f]{40}$/);
  });

  it("SEC-07: SECURITY.md routes reports privately and promises an acknowledgement within 7 days", () => {
    const policy = read("SECURITY.md");
    expect(policy).toMatch(/private vulnerability reporting/i);
    expect(policy).toMatch(/within 7 days/);
  });
});

describe("quality gates in CI", () => {
  it("QLT-01: CI runs unit tests, desktop journeys, web journeys, and the budgets", () => {
    const runs = ciRuns();
    for (const stage of ["pnpm test", "pnpm test:e2e", "test:e2e", "pnpm bench --check", "pnpm typecheck"]) expect(runs).toContain(stage);
  });

  it("QLT-05: the committed budgets file names each measure with a budget and a baseline", () => {
    const { measures } = JSON.parse(read("tools/bench/budgets.json"));
    expect(Object.keys(measures).length).toBeGreaterThan(0);
    for (const [name, m] of Object.entries(measures)) {
      expect(name).toMatch(/^[A-Z0-9]+-\d+\./);
      expect(typeof m.budget, name).toBe("number");
    }
  });
});

describe("documentation", () => {
  it("DOC-01: the docs are a Slate host, with Slate pinned as the slate/ submodule", () => {
    expect(read(".gitmodules")).toMatch(/path = slate/);
    expect(JSON.parse(read("documentations/docs-manifest.json"))).toBeTruthy();
  });

  it("DOC-02: seed-specs.md exists and no tool writes it", () => {
    expect(existsSync(join(root, "documentations", "seed-specs.md"))).toBe(true);
    for (const f of readdirSync(join(root, "tools")).filter((f) => f.endsWith(".mjs"))) expect(read(`tools/${f}`), f).not.toMatch(/seed-specs/);
  });
});

describe("design tokens", () => {
  it("DSY-01: the token build's tier and alias rules hold", () => {
    expect(node("packages/tokens/build.mjs", "--check")).toMatch(/rules hold/);
  });
});
