// The Mac review build's startup proof (D-268): the packaged app, unmodified, opens with a fresh
// profile, reaches the writing view through "Just use this computer for now", saves a note on disk,
// and opens again into the writing view. Driven through Chromium's DevTools endpoint, which the
// fuses leave on, so nothing in the app is changed to test it. Run on a Mac, never against the
// owner's profile: the data and notes folders are new temporary folders.
//
//   node scripts/mac-smoke.mjs "<…>/Focus Notes.app/Contents/MacOS/focus-notes" <evidence folder>
//
// Writes smoke.json (machine-readable), app.log and screenshots to the evidence folder. Exits 1
// when any required check fails. Every process it starts is stopped before it exits.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const [exe, evidenceArg] = process.argv.slice(2);
if (!exe || !evidenceArg || !existsSync(exe)) {
  console.error('Usage: node scripts/mac-smoke.mjs "<app>/Contents/MacOS/<executable>" <evidence folder>');
  process.exit(2);
}
const evidence = resolve(evidenceArg);
mkdirSync(evidence, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "fn-mac-smoke-"));
const userData = join(scratch, "user-data");
const docs = join(scratch, "Focus Notes");
const NOTE = "Mac review smoke note";
const log = createWriteStream(join(evidence, "app.log"));
const result = { exe: resolve(exe), startedAt: new Date().toISOString(), profile: "fresh temporary user data and notes folders", runs: [], checks: {} };

const freePort = () => new Promise((ok, fail) => {
  const s = createServer();
  s.unref();
  s.on("error", fail);
  s.listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notesOnDisk = () => (existsSync(docs) ? readdirSync(docs, { recursive: true }).map(String).filter((f) => f.endsWith(".md")) : []);
const savedNote = () => notesOnDisk().find((f) => readFileSync(join(docs, f), "utf8").includes(NOTE));

/** Starts the app in its own process group, waits for its DevTools endpoint, and finds the app's page. */
async function launch(label) {
  const port = await freePort();
  const env = { ...process.env, FOCUS_NOTES_USER_DATA: userData, FOCUS_NOTES_DOCS: docs };
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "ACTIONS_RUNTIME_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN"]) delete env[name];
  const started = Date.now();
  const child = spawn(exe, [`--remote-debugging-port=${port}`], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (d) => log.write(`[${label} out] ${d}`));
  child.stderr.on("data", (d) => log.write(`[${label} err] ${d}`));
  const run = { label, pid: child.pid, exit: null };
  child.on("exit", (code, signal) => { run.exit = { code, signal, afterMs: Date.now() - started }; });
  result.runs.push(run);
  let version;
  for (let i = 0; i < 120 && !version; i++) {
    if (run.exit) throw new Error(`The app exited before its window opened: ${JSON.stringify(run.exit)}`);
    version = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json()).catch(() => undefined);
    if (!version) await sleep(500);
  }
  if (!version) throw new Error("The app's DevTools endpoint never answered.");
  run.browser = version.Browser;
  run.userAgent = version["User-Agent"];
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("/renderer/index.html"));
    if (!page) await sleep(500);
  }
  if (!page) throw new Error("The app's window never loaded its page.");
  run.pageMs = Date.now() - started;
  return { child, browser, page, run, started };
}

/** Quits the app (SIGTERM, then SIGKILL on its whole process group) and waits for it to be gone. */
async function stop(l) {
  if (!l) return;
  await l.browser?.close().catch(() => {});
  const group = -l.child.pid;
  if (!l.run.exit) {
    try { process.kill(group, "SIGTERM"); } catch {}
    for (let i = 0; i < 40 && !l.run.exit; i++) await sleep(250);
  }
  try { process.kill(group, "SIGKILL"); } catch {}
  for (let i = 0; i < 20 && !l.run.exit; i++) await sleep(250);
}

let current;
let failure;
try {
  // First open: the welcome, then writing on this computer only, saved as a Markdown file.
  current = await launch("first");
  const { page } = current;
  const welcome = page.getByRole("heading", { name: "A quiet place to write" });
  await welcome.waitFor({ timeout: 60_000 });
  current.run.welcomeMs = Date.now() - current.started;
  result.checks.welcomeShown = true;
  await page.screenshot({ path: join(evidence, "1-welcome.png") });
  await page.getByRole("button", { name: "Just use this computer for now" }).click();
  const editor = page.getByRole("textbox", { name: "Note" });
  await editor.waitFor({ timeout: 30_000 });
  result.checks.writingViewReached = true;
  await editor.click();
  await page.keyboard.type(`# ${NOTE}\n\nWritten by the Mac review startup proof.`);
  for (let i = 0; i < 60 && !savedNote(); i++) await sleep(500);
  const saved = savedNote();
  result.checks.noteSavedOnDisk = Boolean(saved);
  result.savedNote = saved ?? null;
  await page.screenshot({ path: join(evidence, "2-writing.png") });
  await stop(current);
  current = undefined;
  const state = existsSync(join(userData, "state.json")) ? JSON.parse(readFileSync(join(userData, "state.json"), "utf8")) : {};
  result.checks.firstRunDone = state.firstRun === "done";
  result.checks.noWorkspaceRecord = !existsSync(join(userData, "workspace.json"));

  // Second open: straight back to writing, with no welcome, and the note still there.
  current = await launch("second");
  const again = current.page.getByRole("textbox", { name: "Note" });
  await again.waitFor({ timeout: 60_000 });
  result.checks.reopensToWritingView = true;
  result.checks.welcomeNotShownAgain = (await current.page.getByRole("heading", { name: "A quiet place to write" }).count()) === 0;
  let text = "";
  for (let i = 0; i < 20 && !text.includes(NOTE); i++) {
    text = await again.innerText().catch(() => "");
    if (!text.includes(NOTE)) await sleep(500);
  }
  // Informational: which note opens first is the app's choice, so this isn't a required check.
  result.reopenedNoteShown = text.includes(NOTE);
  await current.page.screenshot({ path: join(evidence, "3-reopened.png") });
} catch (e) {
  failure = e instanceof Error ? e.message : String(e);
  if (current?.page) await current.page.screenshot({ path: join(evidence, "failure.png") }).catch(() => {});
} finally {
  await stop(current);
}

const required = ["welcomeShown", "writingViewReached", "noteSavedOnDisk", "firstRunDone", "noWorkspaceRecord", "reopensToWritingView", "welcomeNotShownAgain"];
result.required = required;
result.failed = required.filter((k) => result.checks[k] !== true);
result.error = failure ?? null;
result.passed = !failure && result.failed.length === 0;
result.notesOnDisk = notesOnDisk();
result.finishedAt = new Date().toISOString();
writeFileSync(join(evidence, "smoke.json"), `${JSON.stringify(result, null, 2)}\n`);
log.end();
console.log(JSON.stringify(result, null, 2));
process.exit(result.passed ? 0 : 1);
