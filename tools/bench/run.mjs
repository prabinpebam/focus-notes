// pnpm bench (QLT-05): measures budgets on a throwaway Git copy of a fixture workspace,
// never real notes. Options: --check, --compare <report.json>, --write-baseline, --runs <n>.
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { largeWorkspace } from "./large.mjs";

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

// A hang fails fast, with the step's name and what was still running (QLT-05): each step has a
// hard time limit (10 minutes; the longest, the 10,000-note workspace, takes about 3), and once the
// report is out the bench must end on its own. It once printed its report on CI and then waited an
// hour for a Git worker that held the process open.
const STEP_TIMEOUT_MS = Number(process.env.FOCUS_NOTES_BENCH_STEP_TIMEOUT_MS ?? 10 * 60_000);
const EXIT_TIMEOUT_MS = 15_000;
/** What still holds the bench: its handles and its own child processes, which it then ends. */
function stillRunning() {
  const children = (process.platform === "win32"
    ? spawnSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${process.pid} } | ForEach-Object { \"$($_.ProcessId) $($_.Name)\" }`], { encoding: "utf8", timeout: 15_000 }).stdout
    : spawnSync("ps", ["-o", "pid=,comm=", "--ppid", String(process.pid)], { encoding: "utf8", timeout: 15_000 }).stdout) ?? "";
  const listed = children.trim().split(/\r?\n/).filter(Boolean);
  for (const line of listed) {
    const pid = Number(line.trim().split(/\s+/)[0]);
    if (!pid || /powershell|ps$/i.test(line)) continue;
    if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { timeout: 15_000 });
    else try { process.kill(pid, "SIGKILL"); } catch { /* gone already */ }
  }
  return `handles ${JSON.stringify(process.getActiveResourcesInfo())}; child processes (ended): ${listed.join(", ") || "none"}`;
}
async function step(name, fn) {
  const started = performance.now();
  console.log(`bench: ${name}…`);
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`bench: "${name}" took over ${STEP_TIMEOUT_MS / 1000} s, so it was stopped; ${stillRunning()}`)), STEP_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([fn(), limit]);
    console.log(`bench: ${name} done in ${((performance.now() - started) / 1000).toFixed(1)} s`);
    return result;
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}
const electronPath = createRequire(join(root, "apps", "desktop", "package.json"))("electron");
const mainEntry = join(root, "apps", "desktop", "out", "main", "main.mjs");

function launchReadyMs(userData, docs) {
  return new Promise((resolve, reject) => {
    // GitHub's API points at a closed local port: the bench never reaches the network.
    const child = spawn(electronPath, [mainEntry], { env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_E2E: "1" } });
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
    // An installed app that's been set up: the desktop's first run is once per install (FRE-01) and ends before writing starts.
    writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
    cold.push(await launchReadyMs(userData, docs));
    warm.push(await launchReadyMs(userData, docs));
  }
  return { "PRF-02.coldReadyMs": median(cold), "PRF-02.warmReadyMs": median(warm) };
}

function rendererOverhead() {
  const out = spawnSync("npx vitest run packages/ui-runtime/test/render.test.ts -t \"renderer overhead\" --silent=false", {
    cwd: root, shell: true, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" }, timeout: STEP_TIMEOUT_MS,
  });
  if (out.error) throw new Error(`The renderer benchmark didn't finish: ${out.error.message}`);
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

// PRF-03: opening a 10,000-word note from Files, from the request to the first frame showing it,
// and how long after the last keystroke the text is on disk. The app reports both on the User Timing
// timeline ("fn:note.open", "fn:note.saved"); Playwright drives it as a person would.
async function noteTimes() {
  const { _electron } = createRequire(join(root, "apps", "desktop", "package.json"))("@playwright/test");
  const { tenThousandWords } = await import(pathToFileURL(join(import.meta.dirname, "fixtures.ts")).href);
  const docs = throwawayWorkspace();
  writeFileSync(join(docs, "long.md"), tenThousandWords());
  const userData = mkdtempSync(join(tmpdir(), "fn-bench-ud-"));
  // Set up already (FRE-01), and never reaching the network, as in the start times.
  writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  const app = await _electron.launch({ args: [mainEntry], env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_E2E: "1" } });
  try {
    const page = await app.firstWindow();
    // The window never takes the computer's focus (D-104 (7)); the page is told it has it.
    await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.waitFor();
    await page.waitForFunction(() => document.activeElement?.hasAttribute("data-editor"));
    // PRF-14 (fn:main.loopLag): the main process's event-loop delay while notes open, are typed in
    // and saved. It moves the window and answers every bridge call, so it must never stall (D-151).
    // Reported only until the stalls it found are removed; then its budget (16 ms p99, 50 ms max) gates.
    await app.evaluate(() => {
      const { monitorEventLoopDelay } = process.getBuiltinModule("node:perf_hooks");
      globalThis.__loopLag = monitorEventLoopDelay({ resolution: 2 });
      globalThis.__loopLag.enable();
    });
    const opens = () => page.evaluate(() => performance.getEntriesByName("fn:note.open", "measure").map((e) => e.duration));
    const open = [];
    for (let i = 0; i < 2 * Math.max(runs, 3); i++) {
      const name = i % 2 === 0 ? "Long note" : "Bench fixture";
      await page.keyboard.press(`${mod}+O`);
      const row = page.getByRole("complementary", { name: "Files" }).getByRole("treeitem", { name, exact: true });
      await row.click();
      const before = (await opens()).length;
      await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Enter");
      await page.waitForFunction((n) => performance.getEntriesByName("fn:note.open", "measure").length > n, before);
      if (name === "Long note") open.push((await opens()).at(-1));
    }
    // In the long note: a burst of typing at the end, then the wait for the disk.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    const saves = [];
    for (let i = 0; i < Math.max(runs, 3); i++) {
      await page.evaluate(() => { window.__lastKey = 0; window.addEventListener("keydown", (e) => { window.__lastKey = e.timeStamp; }, true); });
      await page.keyboard.type(` burst ${i}`, { delay: 25 });
      const last = await page.evaluate(() => window.__lastKey);
      await page.waitForFunction((t) => performance.getEntriesByName("fn:note.saved", "mark").some((m) => m.startTime > t), last, { timeout: 5000 });
      saves.push(await page.evaluate((t) => performance.getEntriesByName("fn:note.saved", "mark").find((m) => m.startTime > t).startTime - t, last));
    }
    const lag = await app.evaluate(() => {
      const h = globalThis.__loopLag;
      h.disable();
      return { p99: h.percentile(99) / 1e6, max: h.max / 1e6 };
    });
    return {
      "PRF-03.openNoteMs": Math.round(median(open)),
      "PRF-03.saveAfterTypingMs": Math.round(median(saves)),
      "PRF-14.mainLoopLagP99Ms": Math.round(lag.p99 * 10) / 10,
      "PRF-14.mainLoopLagMaxMs": Math.round(lag.max * 10) / 10,
    };
  } finally {
    await app.close();
  }
}

// SPT-07: Spotlight from the keypress to the visible panel with its results, in the app, on the
// 5,000-note fixture: the key's time to the end of the app's own measure ("fn:spotlight.open"),
// which ends at the first frame that shows the results (WP-4.2).
async function spotlightTimes() {
  const { _electron } = createRequire(join(root, "apps", "desktop", "package.json"))("@playwright/test");
  const { fixtureNotes } = await import(pathToFileURL(join(import.meta.dirname, "fixtures.ts")).href);
  const docs = throwawayWorkspace();
  for (const n of fixtureNotes()) {
    const p = join(docs, ...n.path.split("/"));
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, n.markdown);
  }
  const userData = mkdtempSync(join(tmpdir(), "fn-bench-ud-"));
  writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  const app = await _electron.launch({ args: [mainEntry], env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_E2E: "1" } });
  try {
    const page = await app.firstWindow();
    // The window never takes the computer's focus (D-104 (7)); the page is told it has it.
    await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.getByRole("textbox", { name: "Note" }).waitFor();
    await page.waitForFunction(() => document.activeElement?.hasAttribute("data-editor"));
    await page.evaluate(() => { window.__keys = []; window.addEventListener("keydown", (e) => { if (e.key === "/") window.__keys.push(e.timeStamp); }, true); });
    const field = page.getByRole("dialog", { name: "Spotlight" }).getByRole("combobox");
    const times = [];
    for (let i = 0; i < 2 * Math.max(runs, 3) + 1; i++) {
      await page.keyboard.press(`${mod}+/`);
      await field.waitFor();
      await page.waitForFunction((n) => performance.getEntriesByName("fn:spotlight.open", "measure").length > n, i);
      times.push(await page.evaluate(() => {
        const m = performance.getEntriesByName("fn:spotlight.open", "measure").at(-1);
        return m.startTime + m.duration - window.__keys.at(-1);
      }));
      await page.keyboard.press("Escape");
      await field.waitFor({ state: "detached" });
      await page.waitForFunction(() => document.activeElement?.hasAttribute("data-editor"));
    }
    // The first open warms the code paths; the rest are what a person feels.
    return { "SPT-07.panelOpenMs": Math.round(median(times.slice(1)) * 10) / 10 };
  } finally {
    await app.close();
  }
}

// SPT-07: the search index on the 5,000-note fixture, through its worker's messages (search.ts).
async function searchTimes() {
  const { measureSearch } = await import(pathToFileURL(join(import.meta.dirname, "search.ts")).href);
  return measureSearch(runs);
}

// PRF-06: publishing 1,000 public and 200 shared notes with the real publisher (publish.ts, WP-5.1).
async function publishTimes() {
  const { measurePublish } = await import(pathToFileURL(join(import.meta.dirname, "publish.ts")).href);
  return measurePublish(1);
}

// PRF-04 and PRF-10: memory and idle CPU with 10,000 notes, and reopening an unchanged note.
const report = { at: new Date().toISOString(), platform: process.platform, measures: {
  ...(await step("start times (PRF-02)", startTimes)),
  ...(await step("renderer overhead (DSY-11)", async () => rendererOverhead())),
  ...(await step("Git status (PRF-07)", gitStatus)),
  ...(await step("opening and saving notes (PRF-03, PRF-14)", noteTimes)),
  ...(await step("the 10,000-note workspace (PRF-04, PRF-10)", () => largeWorkspace({ root, mainEntry }))),
  ...(await step("Spotlight in the app (SPT-07)", spotlightTimes)),
  ...(await step("the search index (SPT-07, FND-04)", searchTimes)),
  ...(await step("publishing (PRF-06)", publishTimes)),
} };
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
  const limit = b ? `budget ${b.budget * margin}${b.unit ?? ""}${margin !== 1 ? ", CI margin" : ""}` : "reported only";
  console.log(`${over || regressed ? "✗" : "✓"} ${name}: ${value}${b?.unit ?? ""} (${limit})${change}`);
}
if (arg("--write-baseline")) {
  for (const [name, value] of Object.entries(report.measures)) if (budgets.measures[name]) budgets.measures[name].baseline = value;
  budgets.baselinePlatform = process.platform;
  writeFileSync(budgetsPath, JSON.stringify(budgets, null, 2) + "\n");
  console.log("Baselines written to tools/bench/budgets.json.");
}
if (arg("--check") && failed) process.exit(1);
// Nothing may hold the bench open once its report is out.
setTimeout(() => {
  console.error(`bench: the report is out but the bench didn't end within ${EXIT_TIMEOUT_MS / 1000} s; ${stillRunning()}`);
  process.exit(1);
}, EXIT_TIMEOUT_MS).unref();
