/**
 * Crash recovery's launch measure (QLT-06, D-190; Architecture → Crash recovery → How it's proven):
 * `fn:recovery.match`, matching what a crash left against the workspace at launch, with the real
 * draft store, on a generated 10,000-note workspace in a temporary folder (never real notes).
 *
 * - `QLT-06.recoveryMatchMs`: 20 drafts as a crash leaves them, each where its note still is:
 *   matched (typed over the text on disk), changed outside the app while it was closed, and already
 *   saved. Budget 30 ms.
 * - `QLT-06.recoveryMatchMovedMs` (reported only): the same 20 drafts with 4 notes renamed and 2
 *   deleted while the app was closed, so the ladder looks through the whole workspace, by file ID,
 *   Git's renames and the text's hash, before keeping a draft as recovered.
 *
 * Each run seeds the drafts again in a fresh data folder: matching deletes saved drafts and moves
 * the others. The workspace itself is only read.
 */
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { DraftStore, workspaceKey } from "../../apps/desktop/src/main/drafts.ts";
import { textHash } from "../../packages/core/src/journal.ts";
// @ts-expect-error: plain JavaScript, no declarations.
import { generateWorkspace } from "./large.mjs";

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const round = (x: number) => Math.round(x * 10) / 10;

interface Seed {
  path: string;
  base: string;
  text: string;
  ino?: string;
  head?: string;
}

function seed(userData: string, ws: string, drafts: Seed[]) {
  const dir = join(userData, "recovery", workspaceKey(ws));
  mkdirSync(dir, { recursive: true });
  drafts.forEach((d, i) => {
    const id = `bench${String(i).padStart(8, "0")}`;
    const header = { v: 1, draft: id, seq: 0, path: d.path, base: textHash(d.base), at: Date.now(), ...(d.ino ? { ino: d.ino } : {}), ...(d.head ? { head: d.head } : {}) };
    writeFileSync(join(dir, `${id}.draft`), `${JSON.stringify(header)}\n${d.text}`);
  });
}

async function matchOnce(ws: string, drafts: Seed[], git: (cwd: string, args: string[]) => Promise<string | undefined>): Promise<{ ms: number; log: string[] }> {
  const userData = mkdtempSync(join(tmpdir(), "fn-bench-recovery-"));
  try {
    seed(userData, ws, drafts);
    performance.clearMeasures("fn:recovery.match");
    const log: string[] = [];
    const store = DraftStore.open({ dataDir: userData, workspace: ws, git, log: (l) => log.push(l) });
    await store.ready();
    await store.settled();
    const m = performance.getEntriesByName("fn:recovery.match", "measure").at(-1);
    if (!m) throw new Error(`No fn:recovery.match measure: ${log.join(" / ")}`);
    return { ms: m.duration, log };
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
}

export async function measureRecovery(runs = 3): Promise<Record<string, number>> {
  const ws: string = generateWorkspace(10_000);
  try {
    const sh = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=Bench", "-c", "user.email=bench@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 });
    const git = async (cwd: string, args: string[]) => {
      try {
        return sh(cwd, ...args);
      } catch {
        return undefined;
      }
    };
    const head = sh(ws, "rev-parse", "HEAD").trim();
    const rel = (i: number) => `Folder ${String(Math.floor(i / 100)).padStart(3, "0")}/note-${i}.md`;
    const disk = (r: string) => readFileSync(join(ws, ...r.split("/")), "utf8");
    // Spread through the workspace: one note in every fifth folder.
    const at = Array.from({ length: 20 }, (_, i) => i * 487 + 13);
    const typed = (base: string) => `${base}\nA paragraph typed just before the crash.\n`;
    const inPlace: Seed[] = at.map((i, k) => {
      const path = rel(i);
      const base = disk(path);
      // 14 matched, 4 changed outside the app (their base is older than the disk), 2 already saved.
      if (k < 14) return { path, base, text: typed(base), head };
      if (k < 18) return { path, base: `${base}An older version.\n`, text: typed(base), head };
      return { path, base, text: base, head };
    });
    const common: number[] = [];
    for (let r = 0; r < runs + 1; r++) {
      const { ms, log } = await matchOnce(ws, inPlace, git);
      if (!log.some((l) => /matched=14 changed=4/.test(l))) throw new Error(`Unexpected outcome: ${log.join(" / ")}`);
      // The first run warms the code paths.
      if (r > 0) common.push(ms);
    }

    // Moved while the app was closed: 2 renamed outside the app (file ID), 2 by a Git commit (renames),
    // and 2 deleted (kept as recovered once every rung has looked).
    const moved = inPlace.map((d) => ({ ...d, ino: String(statSync(join(ws, ...d.path.split("/")), { bigint: true }).ino) }));
    for (const k of [0, 1]) renameSync(join(ws, ...moved[k]!.path.split("/")), join(ws, ...moved[k]!.path.replace(".md", " renamed.md").split("/")));
    for (const k of [2, 3]) {
      moved[k]!.ino = undefined;
      sh(ws, "mv", moved[k]!.path, moved[k]!.path.replace(".md", " moved.md"));
    }
    sh(ws, "commit", "-q", "-m", "Move two notes (as pulled)");
    for (const k of [4, 5]) unlinkSync(join(ws, ...moved[k]!.path.split("/")));
    const worst: number[] = [];
    for (let r = 0; r < runs + 1; r++) {
      const { ms, log } = await matchOnce(ws, moved, git);
      if (!log.some((l) => /matched=12 changed=4 recovered=2/.test(l))) throw new Error(`Unexpected outcome: ${log.join(" / ")}`);
      if (r > 0) worst.push(ms);
    }
    return { "QLT-06.recoveryMatchMs": round(median(common)), "QLT-06.recoveryMatchMovedMs": round(median(worst)) };
  } finally {
    rmSync(ws, { recursive: true, force: true, maxRetries: 5 });
  }
}
