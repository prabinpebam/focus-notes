/**
 * Crash recovery's rules, end to end (QLT-06, D-190; Architecture → Crash recovery → How it's
 * proven). Matching what a crash left at launch writes nothing to the workspace (R1); a draft whose
 * note is as it was typed over comes back in the editor, one undo from the disk's text (matched); a
 * note changed while the app was closed opens the resolver with both (changed); a note renamed while
 * the app was closed, outside the app or by a Git commit, is still found (moved); and a title typed
 * so every key renames the file survives a crash at any key (the rename storm).
 */
import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { launch, PROMPTLY, quit, tempDirs, type Launched } from "./helpers.ts";
import { crash, draftsDir, fileId, LOSS_BUDGET_MS, readDrafts, seedDraft, typeTimed } from "./recovery.ts";

const mod = process.platform === "darwin" ? "Meta" : "Control";
const openKey = process.platform === "darwin" ? "Meta+ArrowDown" : "Enter";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=Recovery", "-c", "user.email=recovery@example.com", "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** Every file in the workspace (Git's own folder aside) with its size and hash, and Git's view of it when it's a repository. */
function snapshot(workspace: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (r !== ".git") walk(join(dir, e.name), r);
        out[`${r}/`] = "folder";
      } else {
        const buf = readFileSync(join(dir, e.name));
        out[r] = `${buf.length} ${createHash("sha256").update(buf).digest("hex")}`;
      }
    }
  };
  walk(workspace, "");
  try {
    out["(git HEAD)"] = git(workspace, "rev-parse", "HEAD");
    out["(git status)"] = git(workspace, "status", "--porcelain", "--untracked-files=all");
  } catch {
    // Not a repository.
  }
  return out;
}

/** The counts the launch's matching logged (`recovery: match-ms=… saved= matched= changed= recovered=`). */
async function matchLine(l: Launched): Promise<Record<string, number>> {
  await expect.poll(() => l.log.some((x) => x.includes("recovery: match-ms=")), PROMPTLY).toBe(true);
  return counts(l)!;
}
/** The counts, once the app is ready: none when there was nothing to match (the line is only logged when there was). */
function counts(l: Launched): Record<string, number> | undefined {
  const line = l.log.find((x) => x.includes("recovery: match-ms="));
  return line ? Object.fromEntries([...line.matchAll(/(\w[\w-]*)=([\d.]+)/g)].map((m) => [m[1]!, Number(m[2])])) : undefined;
}

/** Starts at the given note (the one the person last had open). */
function lastNote(userData: string, note: string) {
  writeFileSync(join(userData, "state.json"), JSON.stringify({ version: 1, firstRun: "done", lastNotePath: note }));
}

async function openFromFiles(page: Page, title: string) {
  await page.keyboard.press(`${mod}+O`);
  const files = page.getByRole("complementary", { name: "Files" });
  await expect(files.getByRole("tree")).toBeVisible();
  const row = files.getByRole("treeitem", { name: new RegExp(`^${title}\\b`) });
  await row.click();
  await expect(row).toBeFocused();
  await page.keyboard.press(openKey);
  await expect(files).toBeHidden();
}

const editorOf = (page: Page) => page.getByRole("textbox", { name: "Note" });

test("QLT-06: matching at launch writes nothing to the workspace, whatever the drafts are (R1)", async () => {
  const dirs = tempDirs();
  const ws = dirs.docs;
  writeFileSync(join(ws, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  writeFileSync(join(ws, "matched.md"), "# Matched\n\nOn disk.\n");
  writeFileSync(join(ws, "changed.md"), "# Changed\n\nOn disk.\n");
  writeFileSync(join(ws, "moving.md"), "# Moving\n\nOn disk.\n");
  writeFileSync(join(ws, "saved.md"), "# Saved\n\nOn disk.\n");
  mkdirSync(join(ws, "deep"));
  writeFileSync(join(ws, "deep", "kept.md"), "# Kept\n\nUntouched.\n");
  git(ws, "init", "-q", "-b", "main");
  git(ws, "add", "-A");
  git(ws, "commit", "-q", "-m", "Start");
  // A first, clean launch does what any first launch does to a workspace; that's committed, so what follows is only matching's.
  await quit(await launch(dirs, { FOCUS_NOTES_WARMUP: "1" }));
  git(ws, "add", "-A");
  git(ws, "commit", "-q", "--allow-empty", "-m", "After a first launch");

  // A draft of every kind.
  seedDraft(dirs.userData, ws, { path: "matched.md", base: "# Matched\n\nOn disk.\n", text: "# Matched\n\nOn disk.\n\nTyped before the crash.\n" });
  seedDraft(dirs.userData, ws, { path: "changed.md", base: "# Changed\n\nOn disk.\n", text: "# Changed\n\nOn disk.\n\nTyped before the crash.\n" });
  writeFileSync(join(ws, "changed.md"), "# Changed\n\nChanged in another editor.\n");
  seedDraft(dirs.userData, ws, { path: "moving.md", base: "# Moving\n\nOn disk.\n", ino: fileId(join(ws, "moving.md")), text: "# Moving\n\nOn disk.\n\nTyped before the crash.\n" });
  renameSync(join(ws, "moving.md"), join(ws, "moved.md"));
  seedDraft(dirs.userData, ws, { path: "saved.md", base: "# Saved\n\nOn disk.\n", text: "# Saved\n\nOn disk.\n" });
  seedDraft(dirs.userData, ws, { path: "gone.md", base: "# Gone\n", text: "# Gone\n\nDeleted outside the app.\n" });
  const otherKey = "0123456789abcdef";
  seedDraft(dirs.userData, ws, { path: "matched.md", text: "# Another workspace's\n" }, otherKey);
  const damaged = join(draftsDir(dirs.userData, ws), "damaged000001.draft");
  writeFileSync(damaged, "{not a header\nhalf a draft");
  writeFileSync(join(draftsDir(dirs.userData, ws), "leftover00001.draft.tmp"), "half a write");
  const other = join(dirs.userData, "recovery", otherKey);
  const otherBefore = readdirSync(other).map((n) => readFileSync(join(other, n), "utf8"));
  git(ws, "add", "-A");
  git(ws, "commit", "-q", "-m", "Changed and moved while closed");
  const before = snapshot(ws);

  // With the warm-up after start on, as a person's launch has it.
  const l = await launch(dirs, { FOCUS_NOTES_WARMUP: "1" });
  await expect(editorOf(l.page)).toContainText("A saved note.");
  const counts = await matchLine(l);
  expect(counts).toMatchObject({ saved: 1, matched: 2, changed: 1, recovered: 1 });
  await expect(l.page.getByRole("status").filter({ hasText: "changed while Focus Notes was closed" })).toBeVisible();
  // Settled: the warm-up and every check after start have run.
  await l.page.waitForTimeout(4000);
  expect(snapshot(ws)).toEqual(before);
  await quit(l);
  expect(snapshot(ws)).toEqual(before);

  // The store's own: another workspace's drafts and a damaged draft are left as they were; a half write is gone.
  expect(readdirSync(other).map((n) => readFileSync(join(other, n), "utf8"))).toEqual(otherBefore);
  expect(readFileSync(damaged, "utf8")).toBe("{not a header\nhalf a draft");
  const kept = readDrafts(dirs.userData, ws);
  expect(kept.map((d) => d.header.path).sort()).toEqual(["changed.md", "gone.md", "matched.md", "moved.md"]);
  expect(kept.find((d) => d.header.path === "gone.md")!.header.state).toBe("recovered");
  expect(readdirSync(draftsDir(dirs.userData, ws)).some((n) => n.endsWith(".tmp"))).toBe(false);
});

test("QLT-06: a matched draft comes back in the editor as unsaved, and one undo gets back exactly the disk's text", async () => {
  const dirs = tempDirs();
  const disk = "# Plan\n\nFirst step.\n";
  const typed = "# Plan\n\nFirst step.\n\nSecond step, typed before the crash.\n";
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  const plan = join(dirs.docs, "plan.md");
  writeFileSync(plan, disk);
  seedDraft(dirs.userData, dirs.docs, { path: "plan.md", base: disk, text: typed });

  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("status").filter({ hasText: "Restored what you were writing in “Plan”." })).toBeVisible();
  // Not written at launch: the note waits, marked unsaved in Files, until it's opened.
  await page.waitForTimeout(1000);
  expect(readFileSync(plan, "utf8")).toBe(disk);
  await page.keyboard.press(`${mod}+O`);
  const files = page.getByRole("complementary", { name: "Files" });
  await expect(files.getByRole("treeitem", { name: /^Plan\b/ })).toContainText("unsaved");
  await page.keyboard.press("Escape");
  await expect(files).toBeHidden();

  await openFromFiles(page, "Plan");
  await expect(editorOf(page)).toContainText("Second step, typed before the crash.");
  // As if typed: the normal save writes it.
  await expect.poll(() => readFileSync(plan, "utf8"), PROMPTLY).toBe(typed);
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.press(`${mod}+Z`);
  await expect(editorOf(page)).not.toContainText("Second step");
  await expect(editorOf(page)).toContainText("First step.");
  await expect.poll(() => readFileSync(plan, "utf8"), PROMPTLY).toBe(disk);
  await quit(l);
  expect(readDrafts(dirs.userData, dirs.docs)).toEqual([]);
});

test("QLT-06: opening a note that changed while the app was closed shows the resolver with Recovered and On disk", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  const plan = join(dirs.docs, "plan.md");
  seedDraft(dirs.userData, dirs.docs, { path: "plan.md", base: "# Plan\n\nFirst step.\n", text: "# Plan\n\nFirst step.\n\nTyped before the crash.\n" });
  writeFileSync(plan, "# Plan\n\nChanged in another editor.\n");

  const l = await launch(dirs);
  const { page } = l;
  await expect(page.getByRole("status").filter({ hasText: "“Plan” changed while Focus Notes was closed. Compare to keep what you need." })).toBeVisible();
  await expect(editorOf(page)).toContainText("A saved note.");
  await openFromFiles(page, "Plan");
  const dialog = page.getByRole("dialog", { name: /changed while Focus Notes was closed/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("region", { name: "Recovered" })).toContainText("Typed before the crash.");
  await expect(dialog.getByRole("region", { name: "On disk" })).toContainText("Changed in another editor.");
  await page.waitForTimeout(1000);
  expect(readFileSync(plan, "utf8")).toBe("# Plan\n\nChanged in another editor.\n");
  expect(readdirSync(dirs.docs).sort()).toEqual(["Welcome.md", "plan.md"]);
  await l.app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dialog.showMessageBox;
  });
  await quit(l);
});

test("QLT-06: a note renamed outside the app while it was closed is still found, by its file's ID", async () => {
  const dirs = tempDirs();
  writeFileSync(join(dirs.docs, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  const disk = "# Moving\n\nOn disk.\n";
  const typed = "# Moving\n\nOn disk.\n\nTyped before the crash.\n";
  writeFileSync(join(dirs.docs, "moving.md"), disk);
  seedDraft(dirs.userData, dirs.docs, { path: "moving.md", base: disk, ino: fileId(join(dirs.docs, "moving.md")), text: typed });
  mkdirSync(join(dirs.docs, "later"));
  const moved = join(dirs.docs, "later", "renamed.md");
  renameSync(join(dirs.docs, "moving.md"), moved);
  // Another note with the same text: only the file's ID can tell which one it was.
  writeFileSync(join(dirs.docs, "twin.md"), disk);
  lastNote(dirs.userData, moved);

  const l = await launch(dirs);
  expect(await matchLine(l)).toMatchObject({ matched: 1, recovered: 0 });
  await expect(editorOf(l.page)).toContainText("Typed before the crash.");
  await expect.poll(() => readFileSync(moved, "utf8"), PROMPTLY).toBe(typed);
  expect(readFileSync(join(dirs.docs, "twin.md"), "utf8")).toBe(disk);
  await quit(l);
  expect(readDrafts(dirs.userData, dirs.docs)).toEqual([]);
});

test("QLT-06: a note renamed by a Git commit while the app was closed (a pull) is still found, by Git's renames", async () => {
  const dirs = tempDirs();
  const ws = dirs.docs;
  const disk = "# Plan\n\nFirst step.\n";
  const typed = "# Plan\n\nFirst step.\n\nTyped before the pull.\n";
  writeFileSync(join(ws, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  writeFileSync(join(ws, "plan.md"), disk);
  // Another note with the same text, so the text alone can't say which one it was.
  writeFileSync(join(ws, "twin.md"), disk);
  git(ws, "init", "-q", "-b", "main");
  git(ws, "add", "-A");
  git(ws, "commit", "-q", "-m", "Start");
  const head = git(ws, "rev-parse", "HEAD");
  // No file ID: as when the pull replaced the file rather than renamed it.
  seedDraft(dirs.userData, ws, { path: "plan.md", base: disk, head, text: typed });
  mkdirSync(join(ws, "projects"));
  git(ws, "mv", "plan.md", "projects/plan.md");
  git(ws, "commit", "-q", "-m", "Move the plan (as pulled)");
  const moved = join(ws, "projects", "plan.md");
  lastNote(dirs.userData, moved);

  const l = await launch(dirs);
  expect(await matchLine(l)).toMatchObject({ matched: 1, recovered: 0 });
  await expect(editorOf(l.page)).toContainText("Typed before the pull.");
  await expect.poll(() => readFileSync(moved, "utf8"), PROMPTLY).toBe(typed);
  expect(readFileSync(join(ws, "twin.md"), "utf8")).toBe(disk);
  await quit(l);
  expect(readDrafts(dirs.userData, ws)).toEqual([]);
});

/**
 * The rename storm (fault injection): a new note's file follows its title as it's typed (FIL-07),
 * so every key can rename it. Killed at a random key, each relaunch must find the note's text
 * (never only as a recovered draft), lose at most about a second of it, and leave no file in the
 * workspace beyond the one note. FOCUS_NOTES_STORM_ROUNDS sets the rounds (CI: 40; locally 8 unless
 * set), FOCUS_NOTES_FAULT_SEED replays a failing run.
 */
const stormRounds = Number(process.env.FOCUS_NOTES_STORM_ROUNDS ?? (process.env.CI ? 40 : 8));
const seed = Number(process.env.FOCUS_NOTES_FAULT_SEED ?? Date.now() % 1_000_000);
function random(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = "calm quiet notes plain focus band drafts ideas river stone".split(" ");
const notes = (ws: string) => readdirSync(ws).filter((n) => !n.startsWith(".")).sort();
/** The workspace's notes once they stop changing (the same for a second). */
async function stable(ws: string): Promise<string[]> {
  let last = JSON.stringify(notes(ws));
  for (let same = 0, i = 0; same < 3 && i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const now = JSON.stringify(notes(ws));
    same = now === last ? same + 1 : 0;
    last = now;
  }
  return JSON.parse(last) as string[];
}
/** A note's title line as typed: the heading's markdown, unescaped. */
const titleOf = (text: string) => (text.split("\n")[0] ?? "").replace(/&#x20;/g, " ").replace(/^\\#/, "#");

test(`QLT-06: a title typed so every key renames the file survives a crash at any key, ${stormRounds} rounds`, async () => {
  console.log(`[rename-storm] seed=${seed} (replay with FOCUS_NOTES_FAULT_SEED=${seed})`);
  test.setTimeout(60_000 + stormRounds * 30_000);
  const rnd = random(seed);
  const dirs = tempDirs();
  const ws = dirs.docs;
  writeFileSync(join(ws, "Welcome.md"), "# Welcome\n\nA saved note.\n");
  let expected = ["Welcome.md"];
  let lastAdded = "";
  const report: number[] = [];
  let l: Launched | undefined;
  const started = Date.now();
  try {
    for (let round = 1; round <= stormRounds; round++) {
      l = await launch(dirs);
      const at = `round ${round} (seed ${seed})`;
      await expect(editorOf(l.page)).toBeFocused();
      if (round > 1) {
        // Every draft the crashes left is back in its note, waiting to be opened: none only recovered.
        await l.readyMs();
        await l.page.waitForTimeout(300);
        expect(counts(l)?.recovered ?? 0, `${at}: no draft lost its note`).toBe(0);
        for (const d of readDrafts(dirs.userData, ws)) expect(statSync(join(ws, d.header.path)).isFile(), `${at}: ${d.header.path} is a note`).toBe(true);
      }
      await l.page.waitForTimeout(300);
      // The launch writes no file. The note the last crash left open is opened again and its text
      // goes back in: the normal save writes it, and its file follows its title (FIL-07), so that one
      // note may be renamed; nothing else changes, and nothing is added.
      const settled = await stable(ws);
      expect(settled.length, `${at}: the launch added no file: ${JSON.stringify(settled)}`).toBe(expected.length);
      expect(settled.filter((n) => !expected.includes(n)).length, `${at}: only the last note was renamed`).toBeLessThanOrEqual(1);
      expect(expected.filter((n) => !settled.includes(n)).every((n) => n === lastAdded), `${at}: only the last note was renamed`).toBe(true);
      expected = settled;

      // The new note's file is written before it opens, and the note left may be empty too: typing
      // waits for the new note's own editor, never the one being replaced.
      await editorOf(l.page).evaluate((el) => el.setAttribute("data-storm-left", ""));
      await l.page.keyboard.press(`${mod}+N`);
      await expect(l.page.locator("[data-storm-left]")).toHaveCount(0, PROMPTLY);
      await expect(editorOf(l.page)).toHaveText("");
      await expect(editorOf(l.page)).toBeFocused();
      await expect.poll(() => notes(ws).length, PROMPTLY).toBe(expected.length + 1);
      const title = `# ${WORDS[Math.floor(rnd() * WORDS.length)]} storm ${round} ${WORDS[Math.floor(rnd() * WORDS.length)]}`;
      const killAfter = 1 + Math.floor(rnd() * title.length);
      let keys = 0;
      const typed = await typeTimed(l.page, title, { delayMs: 15 + Math.floor(rnd() * 40), until: () => ++keys >= killAfter });
      if (rnd() < 0.4) await l.page.waitForTimeout(Math.floor(rnd() * 600));
      const appLog = l.log;
      const crashedAt = await crash(l, dirs.userData);
      l = undefined;

      // One new note, under the name of some prefix of its title, and nothing else.
      const now = notes(ws);
      const added = now.filter((n) => !expected.includes(n));
      expect(added.length, `${at}: one new file, not ${JSON.stringify(added)}`).toBe(1);
      expect(now.length, `${at}: every earlier note is still there`).toBe(expected.length + 1);
      const file = join(ws, added[0]!);
      // What came through: the note on disk, or a draft ahead of it.
      const raw = [readFileSync(file, "utf8"), ...readDrafts(dirs.userData, ws).map((d) => `[${d.header.path}${d.header.state ? ` ${d.header.state}` : ""}] ${d.text}`)];
      const candidates = [readFileSync(file, "utf8"), ...readDrafts(dirs.userData, ws).map((d) => d.text)].map(titleOf).filter((t) => t && typed.text.startsWith(t.trimEnd()));
      const kept = Math.max(0, ...candidates.map((t) => t.trimEnd().length));
      const lostMs = typed.lostMs(kept, crashedAt);
      report.push(lostMs);
      if (lostMs > LOSS_BUDGET_MS) console.log(appLog.slice(-40).join("\n"));
      expect(lostMs, `${at}: lost ${lostMs} ms of "${typed.text}" (kept ${kept} characters; ${added[0]}: ${JSON.stringify(raw)})`).toBeLessThanOrEqual(LOSS_BUDGET_MS);
      expected = now;
      lastAdded = added[0]!;
    }
    // The last crash's drafts are found too.
    l = await launch(dirs);
    await l.readyMs();
    await l.page.waitForTimeout(300);
    expect(counts(l)?.recovered ?? 0).toBe(0);
    expect((await stable(ws)).length).toBe(expected.length);
    await quit(l);
    l = undefined;
  } finally {
    if (l) await crash(l, dirs.userData).catch(() => {});
  }
  const lost = [...report].sort((a, b) => a - b);
  console.log(`[rename-storm] seed=${seed} rounds=${stormRounds} took=${Math.round((Date.now() - started) / 1000)}s lost-ms p50=${lost[Math.floor(lost.length / 2)]} worst=${lost.at(-1)}`);
});
