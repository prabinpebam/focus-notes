// How long a built Focus Notes takes to open (D-216): from the double-click (the process starting)
// to the window showing and to an editable caret, measured by the wall clock from outside, so the
// installed app and the portable can be compared with what a person feels.
//
//   pnpm bench:launch                      the installed app (%LOCALAPPDATA%\Programs\…)
//   pnpm bench:launch -- --exe <path>      any build: the portable, release\win-unpacked\focus-notes.exe
//   pnpm bench:launch -- --runs 5
//
// Each run opens the app with a throwaway profile and notes folder (never the person's notes, and
// never their running app: the single-instance lock is per profile), waits for the app's launch log
// (`FOCUS_NOTES_LAUNCH_LOG`), and closes it. The first run of a profile is a first launch; the
// others reuse it, like a person opening the app again. A window shows briefly on each run.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};

function installed() {
  const base = join(process.env.LOCALAPPDATA ?? "", "Programs");
  return ["focus-notes", "Focus Notes", "@focus-notesdesktop"].map((d) => join(base, d, "focus-notes.exe")).find((p) => existsSync(p));
}

const exe = arg("exe") ? resolve(arg("exe")) : installed();
const runs = Math.max(1, Number(arg("runs", "3")));
const LIMIT_MS = 60_000;

if (!exe || !existsSync(exe)) {
  console.error("No Focus Notes found to time. Install it, or pass --exe <path to focus-notes.exe or the portable>.");
  process.exit(1);
}

/** Ends the app and everything it started (the portable's launcher starts the app as a child). */
function end(child) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill();
}

function once(profile, docs) {
  const log = join(profile, "..", `${Date.now()}-launch.jsonl`);
  return new Promise((done) => {
    const start = Date.now();
    const child = spawn(exe, [], {
      env: { ...process.env, FOCUS_NOTES_USER_DATA: profile, FOCUS_NOTES_DOCS: docs, FOCUS_NOTES_LAUNCH_LOG: log, FOCUS_NOTES_WARMUP: "0" },
      stdio: "ignore",
    });
    const marks = {};
    const finish = (timedOut) => {
      clearInterval(poll);
      clearTimeout(limit);
      end(child);
      rmSync(log, { force: true });
      done({ ...marks, ...(timedOut ? { timedOut: true } : {}) });
    };
    const poll = setInterval(() => {
      let text = "";
      try { text = readFileSync(log, "utf8"); } catch { return; }
      for (const line of text.split("\n")) {
        if (!line) continue;
        const e = JSON.parse(line);
        if (!(e.event in marks)) marks[e.event] = { wallMs: e.at - start, uptimeMs: e.uptimeMs };
      }
      if (marks.shown && marks.ready) finish(false);
    }, 25);
    const limit = setTimeout(() => finish(true), LIMIT_MS);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 1500));
const median = (xs) => {
  const s = xs.filter((x) => x !== undefined).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : undefined;
};

console.log(`Timing ${exe}`);
const root = mkdtempSync(join(tmpdir(), "focus-notes-launch-"));
const rows = [];
try {
  const profile = join(root, "profile");
  const docs = join(root, "notes");
  // Straight into writing: the first run's steps are done.
  mkdirSync(profile, { recursive: true });
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(profile, "state.json"), JSON.stringify({ version: 1, firstRun: "done" }));
  for (let i = 0; i < runs; i++) {
    const kind = i === 0 ? "first" : "again";
    const m = await once(profile, docs);
    rows.push({ kind, shown: m.shown?.wallMs, ready: m.ready?.wallMs, appUptime: m.ready?.uptimeMs, timedOut: m.timedOut });
    console.log(`${String(i + 1).padStart(2)}. ${kind.padEnd(5)}  window ${String(m.shown?.wallMs ?? "-").padStart(5)} ms  caret ${String(m.ready?.wallMs ?? "-").padStart(5)} ms  (app's own start ${m.ready?.uptimeMs ?? "-"} ms)${m.timedOut ? "  timed out" : ""}`);
    await settle();
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
const again = rows.filter((r) => r.kind === "again");
if (again.length) console.log(`Median of opening again: window ${median(again.map((r) => r.shown))} ms, caret ${median(again.map((r) => r.ready))} ms.`);
console.log("Before the app's own start is Windows loading it (and, for the portable, unpacking it).");
