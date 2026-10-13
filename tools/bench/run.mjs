// pnpm bench (QLT-05): measures budgets on a throwaway Git copy of a fixture workspace,
// never real notes. Options: --check, --compare <report.json>, --write-baseline, --runs <n>.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
    let ready;
    const timer = setTimeout(() => { child.kill(); reject(new Error("The app never reported ready")); }, 30_000);
    child.stdout.on("data", (d) => {
      const m = String(d).match(/ready-ms=(\d+)/);
      if (m && ready === undefined) { ready = Number(m[1]); clearTimeout(timer); child.kill(); }
    });
    // Resolve only once the process has exited, so the next launch doesn't meet the single-instance lock.
    child.on("exit", () => (ready === undefined ? reject(new Error("The app exited before it was ready")) : resolve(ready)));
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

// PRF-07: one `git status` per repository per refresh, and a cached answer within 5 ms. The fixture
// workspace gets a private repository as its `private/` submodule, as an instance has.
async function gitStatus() {
  const docs = throwawayWorkspace();
  const git = (cwd, ...args) => execFileSync("git", ["-c", "protocol.file.allow=always", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const id = ["-c", "user.name=Bench", "-c", "user.email=bench@example.com", "-c", "commit.gpgsign=false"];
  const priv = mkdtempSync(join(tmpdir(), "fn-bench-private-"));
  git(priv, "init", "-q", "-b", "main");
  mkdirSync(join(priv, "notes"));
  writeFileSync(join(priv, "notes", "welcome.md"), "# Private\n");
  git(priv, "add", "-A");
  git(priv, ...id, "commit", "-q", "-m", "Start");
  git(docs, "submodule", "add", "-q", priv, "private");
  git(docs, "add", "-A");
  git(docs, ...id, "commit", "-q", "-m", "Start");
  const { GitSync } = await import(pathToFileURL(join(root, "apps", "desktop", "src", "main", "git", "sync.ts")).href);
  const { createRunner } = await import(pathToFileURL(join(root, "apps", "desktop", "src", "main", "git", "run.ts")).href);
  let statuses = 0;
  const run = createRunner({ onSpawn: (args) => { if (args.includes("status")) statuses++; } });
  const sync = await GitSync.open({ folder: docs, run, fetchEveryMs: 3_600_000 });
  try {
    sync.changed();
    statuses = 0;
    await sync.status();
    const processes = statuses;
    const cached = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      await sync.status();
      cached.push(performance.now() - t);
    }
    if (statuses !== processes) throw new Error("A cached status started a Git process");
    return { "PRF-07.statusProcesses": processes, "PRF-07.cachedStatusMs": Math.round(median(cached) * 100) / 100 };
  } finally {
    await sync.dispose();
  }
}

const report = { at: new Date().toISOString(), platform: process.platform, measures: { ...(await startTimes()), ...rendererOverhead(), ...(await gitStatus()) } };
mkdirSync(join(root, "test-results"), { recursive: true });
writeFileSync(join(root, "test-results", "bench.json"), JSON.stringify(report, null, 2));

const against = arg("--compare") ? JSON.parse(readFileSync(argValue("--compare"), "utf8")).measures : undefined;
// Budgets are set for reference hardware; CI runners get the margin the spec allows (Performance and quality).
const margin = process.env.CI ? (budgets.ciMargin ?? 1.5) : 1;
// Baselines only mean something on the machine that recorded them.
const baselinesApply = !process.env.CI && budgets.baselinePlatform === process.platform;
let failed = false;
for (const [name, value] of Object.entries(report.measures)) {
  const b = budgets.measures[name];
  const base = against?.[name] ?? (baselinesApply ? b?.baseline : undefined);
  const change = base != null ? ` (${value >= base ? "+" : ""}${(((value - base) / Math.abs(base || 1)) * 100).toFixed(1)}% vs ${base})` : "";
  const over = b && value > b.budget * margin;
  const regressed = b && base != null && !arg("--write-baseline") && (b.noiseAbsolute != null ? value - base > b.noiseAbsolute : value > base * (1 + b.noise));
  if (over || regressed) failed = true;
  console.log(`${over || regressed ? "✗" : "✓"} ${name}: ${value}${b?.unit ?? ""} (budget ${b?.budget * margin}${b?.unit ?? ""}${margin !== 1 ? ", CI margin" : ""})${change}`);
}
if (arg("--write-baseline")) {
  for (const [name, value] of Object.entries(report.measures)) if (budgets.measures[name]) budgets.measures[name].baseline = value;
  budgets.baselinePlatform = process.platform;
  writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2) + "\n");
  console.log("Baselines written to tools/bench/budgets.json.");
}
if (arg("--check") && failed) process.exit(1);
