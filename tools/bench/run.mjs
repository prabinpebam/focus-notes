// pnpm bench (QLT-05): measures budgets on a throwaway Git copy of a fixture workspace,
// never real notes. Options: --check, --compare <report.json>, --write-baseline, --runs <n>.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");
const budgetsPath = join(import.meta.dirname, "budgets.json");
const budgets = JSON.parse(readFileSync(budgetsPath, "utf8"));
const arg = (name) => process.argv.includes(name);
const argValue = (name) => process.argv[process.argv.indexOf(name) + 1];
const runs = Number(arg("--runs") ? argValue("--runs") : 3);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function throwawayWorkspace() {
  const docs = mkdtempSync(join(tmpdir(), "fn-bench-ws-"));
  cpSync(join(import.meta.dirname, "fixture-workspace"), docs, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: docs });
  return docs;
}

const electronPath = createRequire(join(root, "apps", "desktop", "package.json"))("electron");
const mainEntry = join(root, "apps", "desktop", "out", "main", "main.mjs");

function launchReadyMs(userData, docs) {
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [mainEntry], { env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs } });
    const timer = setTimeout(() => { child.kill(); reject(new Error("The app never reported ready")); }, 20_000);
    child.stdout.on("data", (d) => {
      const m = String(d).match(/ready-ms=(\d+)/);
      if (m) { clearTimeout(timer); child.kill(); resolve(Number(m[1])); }
    });
  });
}

async function startTimes() {
  const cold = [], warm = [];
  for (let i = 0; i < runs; i++) {
    const docs = throwawayWorkspace();
    const userData = mkdtempSync(join(tmpdir(), "fn-bench-ud-"));
    cold.push(await launchReadyMs(userData, docs));
    warm.push(await launchReadyMs(userData, docs));
  }
  return { "PRF-02.coldReadyMs": median(cold), "PRF-02.warmReadyMs": median(warm) };
}

function rendererOverhead() {
  const out = spawnSync("npx vitest run packages/ui-runtime/test/render.test.ts -t \"renderer overhead\" --silent=false", {
    cwd: root, shell: true, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" },
  });
  const m = `${out.stdout}${out.stderr}`.match(/DSY-11: overhead (-?[\d.]+)%/);
  if (!m) throw new Error("The renderer benchmark produced no result");
  return { "DSY-11.rendererOverheadPct": Number(m[1]) };
}

const report = { at: new Date().toISOString(), platform: process.platform, measures: { ...(await startTimes()), ...rendererOverhead() } };
mkdirSync(join(root, "test-results"), { recursive: true });
writeFileSync(join(root, "test-results", "bench.json"), JSON.stringify(report, null, 2));

const against = arg("--compare") ? JSON.parse(readFileSync(argValue("--compare"), "utf8")).measures : undefined;
let failed = false;
for (const [name, value] of Object.entries(report.measures)) {
  const b = budgets.measures[name];
  const base = against?.[name] ?? b?.baseline;
  const change = base != null ? ` (${value >= base ? "+" : ""}${(((value - base) / Math.abs(base || 1)) * 100).toFixed(1)}% vs ${base})` : "";
  const over = b && value > b.budget;
  const regressed = b && base != null && !arg("--write-baseline") && (b.noiseAbsolute != null ? value - base > b.noiseAbsolute : value > base * (1 + b.noise));
  if (over || regressed) failed = true;
  console.log(`${over || regressed ? "✗" : "✓"} ${name}: ${value}${b?.unit ?? ""} (budget ${b?.budget}${b?.unit ?? ""})${change}`);
}
if (arg("--write-baseline")) {
  for (const [name, value] of Object.entries(report.measures)) if (budgets.measures[name]) budgets.measures[name].baseline = value;
  writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2) + "\n");
  console.log("Baselines written to tools/bench/budgets.json.");
}
if (arg("--check") && failed) process.exit(1);
