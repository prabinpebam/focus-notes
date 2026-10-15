// Where the main process stalls (PRF-14, D-151 (5)): a CPU profile of the main process and its
// event-loop delay, phase by phase, on the 10,000-note workspace: the scan after start, opening
// notes, typing and saving, and a backup. Prints each phase's loop delay (p99 and max, as
// `fn:main.loopLag` measures it) and every stretch of JavaScript over 10 ms with the functions it
// spent its time in. A developer's tool, never part of `pnpm bench`'s budgets:
//   node tools/bench/main-profile.mjs [--notes 10000] [--out test-results/main.cpuprofile]
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateWorkspace } from "./large.mjs";

const root = join(import.meta.dirname, "..", "..");
const mainEntry = join(root, "apps", "desktop", "out", "main", "main.mjs");
const argValue = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const notes = Number(argValue("--notes", "10000"));
const out = argValue("--out", join(root, "test-results", "main.cpuprofile"));

const { _electron } = createRequire(join(root, "apps", "desktop", "package.json"))("@playwright/test");
const docs = generateWorkspace(notes);
const userData = mkdtempSync(join(tmpdir(), "fn-profile-ud-"));
writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: join(docs, "Welcome.md") }));
const app = await _electron.launch({
  args: [mainEntry],
  // A backup 2 s after typing stops, so one happens while profiling.
  env: { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_GITHUB_API: "http://127.0.0.1:9", FOCUS_NOTES_E2E: "1", FOCUS_NOTES_IDLE_COMMIT_MS: "2000", FOCUS_NOTES_BACKUP_SHORT_MS: "2000" },
});
const phases = [];
try {
  // The profiler and the loop delay start as early as the main process can be reached.
  await app.evaluate(async () => {
    const { Session } = process.getBuiltinModule("node:inspector");
    const { monitorEventLoopDelay } = process.getBuiltinModule("node:perf_hooks");
    const s = new Session();
    s.connect();
    const post = (m, p) => new Promise((res, rej) => s.post(m, p, (e, r) => (e ? rej(e) : res(r))));
    await post("Profiler.enable");
    await post("Profiler.setSamplingInterval", { interval: 250 });
    await post("Profiler.start");
    const h = monitorEventLoopDelay({ resolution: 2 });
    h.enable();
    globalThis.__profile = { post, h, t0: performance.now() };
  });
  const page = await app.firstWindow();
  await (await page.context().newCDPSession(page)).send("Emulation.setFocusEmulationEnabled", { enabled: true });
  const phase = async (name, run) => {
    const start = await app.evaluate(() => {
      globalThis.__profile.h.reset();
      return performance.now();
    });
    await run();
    const end = await app.evaluate(() => performance.now());
    const lag = await app.evaluate(() => {
      const h = globalThis.__profile.h;
      return { p99: h.percentile(99) / 1e6, max: h.max / 1e6 };
    });
    phases.push({ name, start, end, ...lag });
  };
  const mod = process.platform === "darwin" ? "Meta" : "Control";
  await phase("scan (start to every note indexed)", async () => {
    await page.waitForFunction(() => Boolean(document.activeElement?.closest("[data-editor]")), null, { timeout: 60_000 });
    await page.waitForFunction((n) => performance.getEntriesByName("fn:search.indexed", "mark").some((m) => m.detail?.notes >= n), notes, { timeout: 300_000 });
  });
  await phase("open notes", async () => {
    for (const name of ["Alpha", "Beta", "Alpha", "Beta"]) {
      await page.keyboard.press(`${mod}+O`);
      await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "treeitem", null, { timeout: 30_000 });
      await page.keyboard.type(name);
      await page.waitForFunction((n) => document.activeElement?.textContent?.includes(n), name, { timeout: 30_000 });
      await page.keyboard.press("Enter");
      await page.waitForTimeout(300);
    }
  });
  await phase("typing and saving", async () => {
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" a burst of typing to save and back up later ".repeat(4), { delay: 20 });
    await page.waitForTimeout(1500);
  });
  await phase("backup (idle commit)", async () => {
    await page.waitForTimeout(6000);
  });
  const profile = await app.evaluate(async () => (await globalThis.__profile.post("Profiler.stop")).profile);
  mkdirSync(join(out, ".."), { recursive: true });
  writeFileSync(out, JSON.stringify(profile));
  analyse(profile);
} finally {
  await app.close();
}

/** Every stretch of JavaScript (garbage collection included) longer than 10 ms, by phase, with where its time went. */
function analyse(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const label = (n) => {
    const f = n.callFrame;
    const file = f.url ? f.url.replace(/^.*[\\/](?=[^\\/]+[\\/][^\\/]+$)/, "") : "";
    return `${f.functionName || "(anonymous)"}${file ? ` ${file}:${f.lineNumber + 1}` : ""}`;
  };
  const idle = (n) => ["(idle)", "(program)", "(root)"].includes(n.callFrame.functionName);
  /** The outermost JavaScript frame of a sample: the task that ran. */
  const task = (id) => {
    let top = id;
    for (let p = parent.get(id); p !== undefined && nodes.get(p).callFrame.functionName !== "(root)"; p = parent.get(p)) top = p;
    return label(nodes.get(top));
  };
  let t = profile.startTime;
  const runs = [];
  let run;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const n = nodes.get(profile.samples[i]);
    if (idle(n)) {
      if (run) runs.push(run);
      run = undefined;
      continue;
    }
    run ??= { start: t, end: t, self: new Map(), tasks: new Map() };
    const dt = profile.timeDeltas[i + 1] ?? 0;
    run.end = t + dt;
    run.self.set(label(n), (run.self.get(label(n)) ?? 0) + dt);
    run.tasks.set(task(n.id), (run.tasks.get(task(n.id)) ?? 0) + dt);
  }
  if (run) runs.push(run);
  const ms = (us) => (us / 1000).toFixed(1);
  const t0 = profile.startTime;
  for (const p of phases) console.log(`fn:main.loopLag ${p.name}: p99 ${p.p99.toFixed(1)} ms, max ${p.max.toFixed(1)} ms`);
  const long = runs.filter((r) => r.end - r.start > 10_000).sort((a, b) => b.end - b.start - (a.end - a.start));
  console.log(`\n${long.length} stretches of JavaScript over 10 ms in the main process (longest first):`);
  for (const r of long.slice(0, 25)) {
    const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${ms(v)}`).join("; ");
    console.log(`- ${ms(r.end - r.start)} ms at +${ms(r.start - t0)} ms\n    tasks: ${top(r.tasks)}\n    self: ${top(r.self)}`);
  }
}
