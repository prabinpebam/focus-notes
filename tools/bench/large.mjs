// The 10,000-note measures (PRF-04, PRF-10): memory and idle CPU with a large workspace open, and
// reopening a note that hasn't changed. The workspace is generated in a temporary folder and made
// a real Git repository; it never touches real notes.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORDS = "calm focus note write plain markdown quiet band caret typing journal draft ideas sync commit save folder link title paragraph sentence page story morning evening reading notes".split(" ");
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** 100 folders of 100 notes (about 250 words each, with a link), plus two notes at the top to reopen. */
export function generateWorkspace(notes = 10_000) {
  const docs = mkdtempSync(join(tmpdir(), "fn-bench-10k-"));
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const words = (n) => Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(" ");
  const perFolder = 100;
  for (let f = 0; f * perFolder < notes; f++) {
    const dir = join(docs, `Folder ${String(f).padStart(3, "0")}`);
    mkdirSync(dir);
    for (let n = 0; n < perFolder && f * perFolder + n < notes; n++) {
      const id = f * perFolder + n;
      const body = Array.from({ length: 5 }, () => words(50)).join("\n\n");
      writeFileSync(join(dir, `note-${id}.md`), `# Note ${id}\n\n${body}\n\nSee [the next one](note-${id + 1}.md).\n`);
    }
  }
  // About 1,500 words each: an everyday note.
  for (const name of ["Alpha", "Beta"]) writeFileSync(join(docs, `${name}.md`), `# ${name}\n\n${Array.from({ length: 30 }, () => words(50)).join("\n\n")}\n`);
  writeFileSync(join(docs, "Welcome.md"), "# Welcome to Focus Notes\n\nThe benchmark's workspace.\n");
  const git = (...args) => execFileSync("git", ["-c", "user.name=Bench", "-c", "user.email=bench@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd: docs, stdio: "ignore", maxBuffer: 1 << 26 });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "Start");
  return docs;
}

/**
 * Resident memory of all the app's processes, with pages they share counted once: each process's
 * private working set (what Task Manager shows as its memory), plus the largest shared working set
 * (Electron's own code, mapped into every process). Summing whole working sets would count that
 * code once per process. Measured on Windows, the reference platform for CI (Performance and
 * quality → Performance budgets); elsewhere it isn't reported yet.
 */
function residentMB(metrics) {
  if (process.platform !== "win32") return undefined;
  const pids = metrics.map((m) => m.pid).join(",");
  const out = execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { @(${pids}) -contains $_.IDProcess } | ForEach-Object { '{0} {1}' -f $_.WorkingSetPrivate, $_.WorkingSet }`], { encoding: "utf8" });
  const rows = out.trim().split(/\r?\n/).map((l) => l.trim().split(" ").map(Number)).filter((r) => r.length === 2 && r.every(Number.isFinite));
  if (rows.length !== metrics.length) throw new Error(`Found memory for ${rows.length} of ${metrics.length} processes`);
  if (process.env.FOCUS_NOTES_BENCH_DETAIL) console.error("DETAIL", execFileSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { @(${pids}) -contains $_.IDProcess } | ForEach-Object { '{0}:{1}:{2}' -f $_.IDProcess, [int]($_.WorkingSetPrivate/1MB), [int]($_.WorkingSet/1MB) }`], { encoding: "utf8" }).trim().split(/\r?\n/).join(" "), metrics.map((m) => `${m.pid}=${m.type}`).join(" "));
  const priv = rows.reduce((n, [p]) => n + p, 0);
  const shared = Math.max(...rows.map(([p, ws]) => ws - p));
  return (priv + shared) / (1024 * 1024);
}

/** Sums one field of every process's metrics. */
const sum = (metrics, pick) => metrics.reduce((n, m) => n + pick(m), 0);

export async function largeWorkspace({ root, mainEntry, notes = 10_000, reopenRuns = 7, idleWindowMs = 10_000 }) {
  const { _electron } = createRequire(join(root, "apps", "desktop", "package.json"))("@playwright/test");
  const docs = generateWorkspace(notes);
  const userData = mkdtempSync(join(tmpdir(), "fn-bench-ud-"));
  writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(docs, "Welcome.md") }));
  // The warm-up after start is on, as people have it (PRF-10). GitHub's API points at a closed port.
  const app = await _electron.launch({ args: [mainEntry], env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_E2E: "1" } });
  try {
    const page = await app.firstWindow();
    // The window never takes the computer's focus (D-104 (7)); the page is told it has it.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    // FOCUS_NOTES_E2E_CPU_THROTTLE=4 slows the renderer down like a busy CI runner, to reproduce races.
    const throttle = Number(process.env.FOCUS_NOTES_E2E_CPU_THROTTLE ?? 0);
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    const openKey = process.platform === "darwin" ? "Meta+ArrowDown" : "Enter";
    const editorFocused = () => page.waitForFunction(() => Boolean(document.activeElement?.closest("[data-editor]")), null, { timeout: 30_000 });
    await editorFocused();
    // Ready means the whole workspace is open: listed, and every note read into the search index,
    // which starts after the first caret and reads all 10,000 notes. Measuring before then measures
    // loading, and its long tasks split the Files panel's type-ahead (DEF-4).
    await page.waitForFunction((n) => performance.getEntriesByName("fn:search.indexed", "mark").some((m) => m.detail?.notes >= n), notes, { timeout: 300_000 });

    /** Opens a top-level note from the Files panel; resolves to ms from the key to its text with the caret in it. */
    const open = async (name) => {
      await page.keyboard.press(`${mod}+O`);
      // The panel is ready when focus is on its row, not when a row is drawn: keys typed before
      // then would go to the note.
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "treeitem", null, { timeout: 30_000 });
      await page.keyboard.type(name);
      await page.waitForFunction((n) => document.activeElement?.getAttribute("role") === "treeitem" && document.activeElement.textContent?.includes(n), name, { timeout: 30_000 });
      await page.evaluate((n) => {
        const w = window;
        w.__act = undefined;
        w.__seen = undefined;
        addEventListener("keydown", (e) => { w.__act ??= e.timeStamp; }, { capture: true, once: true });
        const look = () => {
          if (w.__seen !== undefined) return;
          const ed = document.querySelector("[data-editor]");
          if (w.__act !== undefined && ed?.querySelector("h1")?.textContent === n && document.activeElement?.closest("[data-editor]")) w.__seen = performance.now();
          else requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, name);
      await page.keyboard.press(openKey);
      await page.waitForFunction(() => window.__seen !== undefined, null, { timeout: 30_000 });
      return page.evaluate(() => window.__seen - window.__act);
    };

    // The Files panel lists all 10,000 notes, then two notes are opened, and one reopened unchanged.
    await open("Alpha");
    await open("Beta");
    const reopen = [];
    for (let i = 0; i < reopenRuns; i++) {
      reopen.push(await open("Alpha"));
      await open("Beta");
    }
    // Some writing, so memory is measured after use, not only after reading.
    await page.keyboard.press(`${mod}+End`);
    await page.keyboard.press("Enter");
    await page.keyboard.type("A paragraph typed during the benchmark, then saved.", { delay: 10 });
    await page.waitForTimeout(3000);
    const memory = residentMB(await app.evaluate(({ app: a }) => a.getAppMetrics()));
    if (process.env.FOCUS_NOTES_BENCH_DETAIL) {
      const h = await cdp.send("Runtime.getHeapUsage");
      const m = await app.evaluate(() => process.memoryUsage());
      console.error("HEAP renderer used/total MB", Math.round(h.usedSize / 1048576), Math.round(h.totalSize / 1048576), "main rss/heap MB", Math.round(m.rss / 1048576), Math.round(m.heapUsed / 1048576), "rows", await page.evaluate(() => document.querySelectorAll("*").length));
    }

    // Idle: nothing typed or synced. Each process's CPU since the previous call, over the window.
    await page.waitForTimeout(5000);
    await app.evaluate(({ app: a }) => a.getAppMetrics());
    await page.waitForTimeout(idleWindowMs);
    const idleCpu = sum(await app.evaluate(({ app: a }) => a.getAppMetrics()), (m) => m.cpu.percentCPUUsage);
    return {
      ...(memory !== undefined ? { "PRF-04.memoryMB": Math.round(memory) } : {}),
      "PRF-04.idleCpuPct": Math.round(idleCpu * 100) / 100,
      "PRF-10.reopenMs": Math.round(median(reopen) * 10) / 10,
    };
  } finally {
    const pid = await app.evaluate(() => process.pid).catch(() => undefined);
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 15_000))]);
    try {
      if (pid) process.kill(pid);
    } catch {
      // Already gone.
    }
    rmSync(docs, { recursive: true, force: true, maxRetries: 5 });
  }
}
