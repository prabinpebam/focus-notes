/**
 * Fault injection (QLT-03, QLT-06; Definition of done → Reliable): the main process is killed at random
 * points while someone types, pauses (so saves run), and the workspace commits; each relaunch must
 * bring back everything but at most about the last second, never anything that wasn't typed, and
 * the note must never be half-written. What a crash left comes back in the editor and is written by
 * the normal save, never at launch, and no other file ever appears (D-190).
 *
 * Randomized rounds: FOCUS_NOTES_FAULT_ROUNDS sets how many (CI runs a short version, 3; the
 * Definition of done's suite runs 1,000), and FOCUS_NOTES_FAULT_SEED replays a failing run. Each
 * round continues from what the previous crash left, so recovery itself is crashed into too.
 */
import { test, expect } from "./fixtures.ts";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, PROMPTLY, tempDirs, type Launched } from "./helpers.ts";
import { crash, LOSS_BUDGET_MS, readDrafts, START, typedPart, typeTimed } from "./recovery.ts";

const rounds = Number(process.env.FOCUS_NOTES_FAULT_ROUNDS ?? 3);
const seed = Number(process.env.FOCUS_NOTES_FAULT_SEED ?? Date.now() % 1_000_000);
const mod = process.platform === "darwin" ? "Meta" : "Control";

/** A small seeded generator (mulberry32), so a failing run can be replayed. */
function random(s: number) {
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = "calm notes write plain markdown focus band quiet typing journal crash recover save commit sync drafts ideas".split(" ");

// The seed isn't in the title: the runner and its worker load this file at different times.
test(`QLT-03: killed at random points while typing, ${rounds} rounds, nothing is lost but the last second`, async () => {
  console.log(`[fault-injection] seed=${seed} (replay with FOCUS_NOTES_FAULT_SEED=${seed})`);
  test.setTimeout(60_000 + rounds * 45_000);
  const rnd = random(seed);
  const dirs = tempDirs();
  const note = join(dirs.docs, "Welcome.md");
  writeFileSync(note, START);
  // A Git workspace, committing soon after typing stops, so kills land in saves and commits too.
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fault", "-c", "user.email=fault@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: dirs.docs, stdio: "ignore" });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "-m", "Start");
  // Any change backs up after the pause (D-133's threshold set to one character).
  const env = { FOCUS_NOTES_IDLE_COMMIT_MS: "300", FOCUS_NOTES_BACKUP_MIN_CHARS: "1" };

  let kept = "";
  const report: { round: number; typed: number; kept: number; lostMs: number }[] = [];
  // A failed round leaves its relaunch running: it's crashed at the end, or the worker never stops.
  const running = new Set<Launched>();
  const start = async () => {
    const l = await launch(dirs, env);
    running.add(l);
    return l;
  };
  const kill = (l: Launched) => {
    running.delete(l);
    return crash(l, dirs.userData);
  };
  try {
    for (let round = 1; round <= rounds; round++) {
      const l = await start();
      // What the last crash left: on disk once the restored text was saved, and nothing else in the workspace.
      const now = typedPart(readFileSync(note, "utf8"));
      expect(now, `round ${round} (seed ${seed}): the note starts with what was kept`).toBe(kept);
      expect(readdirSync(dirs.docs).filter((n) => !n.startsWith(".")), `round ${round} (seed ${seed}): no file but the note`).toEqual(["Welcome.md"]);
      const editor = l.page.getByRole("textbox", { name: "Note" });
      await expect(editor).toBeFocused();
      await l.page.keyboard.press(`${mod}+End`);
      let prefix = "";
      if (!kept) {
        await l.page.keyboard.press("Enter");
      } else if (!kept.endsWith(" ")) prefix = " ";
      // Random words, with random pauses long enough to save (and commit) now and then.
      const words = Array.from({ length: 6 + Math.floor(rnd() * 14) }, () => WORDS[Math.floor(rnd() * WORDS.length)]);
      const text = prefix + words.join(" ");
      const pauses = new Map<number, number>();
      for (let i = 1; i < text.length; i++) if (rnd() < 0.04) pauses.set(i, 200 + Math.floor(rnd() * 900));
      // The kill lands at a random moment while typing: after a random number of keys.
      const killAfter = Math.floor(rnd() * text.length);
      const typed = await typeTimed(l.page, text.slice(0, killAfter + 1), { pauses, delayMs: 15 + Math.floor(rnd() * 40) });
      // Sometimes a short wait first, so the kill can land inside the save or commit it started.
      if (rnd() < 0.3) await l.page.waitForTimeout(Math.floor(rnd() * 900));
      const crashedAt = await kill(l);

      const after = typedPart(readFileSync(note, "utf8"));
      const all = kept + typed.text;
      // Never anything that wasn't typed, never half a write: a prefix of what was typed.
      expect(all.startsWith(after), `round ${round} (seed ${seed}): ${JSON.stringify(after)} is a prefix of ${JSON.stringify(all)}`).toBe(true);
      // The disk may lag; the draft store must not lag by more than about a second. Check it on
      // relaunch: what it kept comes back in the editor, and the normal save writes it (QLT-06).
      const draft = readDrafts(dirs.userData, dirs.docs).find((d) => d.header.path === "Welcome.md");
      const expected = draft && draft.text !== readFileSync(note, "utf8") ? draft.text : readFileSync(note, "utf8");
      let restoredLaunch = await start();
      // Sometimes the launch that restores is crashed into before its save: the draft is still there for the next.
      if (rnd() < 0.3) {
        await kill(restoredLaunch);
        restoredLaunch = await start();
      }
      await expect.poll(() => readFileSync(note, "utf8"), { ...PROMPTLY, message: `round ${round} (seed ${seed}): the restored text is saved` }).toBe(expected);
      const restored = typedPart(expected);
      expect(all.startsWith(restored), `round ${round} (seed ${seed}): restored ${JSON.stringify(restored)} is a prefix of ${JSON.stringify(all)}`).toBe(true);
      expect(restored.length, `round ${round} (seed ${seed}): nothing from an earlier round is lost`).toBeGreaterThanOrEqual(kept.length);
      const lostMs = typed.lostMs(restored.length - kept.length, crashedAt);
      report.push({ round, typed: typed.text.length, kept: restored.length - kept.length, lostMs });
      expect(lostMs, `round ${round} (seed ${seed}): lost ${lostMs} ms of typing`).toBeLessThanOrEqual(LOSS_BUDGET_MS);
      kept = restored;
      // The relaunch that restored is crashed into as well, once its save is on disk.
      await kill(restoredLaunch);
    }
  } finally {
    for (const l of running) await kill(l).catch(() => {});
  }
  const lost = report.map((r) => r.lostMs).sort((a, b) => a - b);
  console.log(`[fault-injection] seed=${seed} rounds=${rounds} lost-ms p50=${lost[Math.floor(lost.length / 2)]} worst=${lost.at(-1)} all=${report.map((r) => r.lostMs).join(",")}`);
});
