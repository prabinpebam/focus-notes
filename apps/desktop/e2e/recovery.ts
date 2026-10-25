/**
 * Helpers for crash journeys (QLT-03, QLT-06): type with each key's time recorded, kill the main
 * process the way a crash would, read back what a note kept, and read or seed the drafts the app
 * keeps in its own data folder (`<userData>/recovery/<workspace key>/<draft>.draft`, D-190, D-219).
 */
import type { Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { textHash } from "@focus-notes/core/journal";
import type { Launched } from "./helpers.ts";

export { textHash };

/**
 * A crash loses at most about a second of typing (QLT-03). The design keeps it under 0.4 s (the
 * editor hands text over at most 250 ms after it changed, and the draft store keeps each handover
 * within 150 ms, D-152); the rest is room for a busy computer (DEF-14).
 */
export const LOSS_BUDGET_MS = 1000;

/** The note every crash journey starts from. */
export const START = "# Welcome to Focus Notes\n\nStart.\n";

/** What was typed after `START`'s paragraph, as the note on disk has it. */
export function typedPart(content: string): string {
  if (!content.startsWith(START.trimEnd())) throw new Error(`The note lost its start: ${JSON.stringify(content.slice(0, 80))}`);
  // Only the line break the file ends with goes: a space typed last is part of what was typed.
  return content.slice(START.length).replace(/^\n/, "").replace(/\n+$/, "").replace(/&#x20;/g, " ");
}

export interface Typed {
  text: string;
  /** When each character's key went down (Date.now()). */
  at: number[];
  /** How long before the crash the first character that wasn't kept was typed; 0 when all were. */
  lostMs(kept: number, crashedAt: number): number;
}

/**
 * Types `text` key by key, `delayMs` apart, pausing where `pauses` says (index → ms). With `until`,
 * stops as soon as it holds after a key: `text` is then what was typed.
 */
export async function typeTimed(page: Page, text: string, opts: { delayMs?: number; pauses?: Map<number, number>; until?: () => boolean } = {}): Promise<Typed> {
  const at: number[] = [];
  let end = text.length;
  for (let i = 0; i < text.length; i++) {
    const pause = opts.pauses?.get(i);
    if (pause) await page.waitForTimeout(pause);
    at.push(Date.now());
    await page.keyboard.press(text[i] === " " ? "Space" : text[i]!);
    if (opts.until?.()) {
      end = i + 1;
      break;
    }
    await page.waitForTimeout(opts.delayMs ?? 25);
  }
  const typed = text.slice(0, end);
  return { text: typed, at, lostMs: (kept, crashedAt) => (kept >= typed.length ? 0 : crashedAt - at[Math.max(0, kept)]!) };
}

/** The draft store's key for a workspace folder, as `workspaceKey()` in `src/main/drafts.ts` makes it. */
export function workspaceKey(folder: string): string {
  let real = resolve(folder);
  try {
    real = realpathSync.native(real);
  } catch {
    // Not there (yet): its path as given.
  }
  let p = real.split(sep).join("/");
  if (process.platform === "win32") p = p.toLowerCase();
  return createHash("sha256").update(p).digest("hex").slice(0, 16);
}

/** The folder a workspace's drafts are kept in. */
export const draftsDir = (userData: string, workspace: string) => join(userData, "recovery", workspaceKey(workspace));

export interface DraftHeader {
  v: 1;
  draft: string;
  seq: number;
  /** Relative to the workspace, with `/`. */
  path: string;
  base?: string;
  noteId?: string;
  ino?: string;
  head?: string;
  at: number;
  state?: "recovered";
  enc?: "os";
}

/** Every whole draft kept for a workspace, with its text (a draft caught mid-write is skipped). */
export function readDrafts(userData: string, workspace: string): { file: string; header: DraftHeader; text: string }[] {
  const dir = draftsDir(userData, workspace);
  const out: { file: string; header: DraftHeader; text: string }[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith(".draft")) continue;
    try {
      const buf = readFileSync(join(dir, name));
      const nl = buf.indexOf(10);
      out.push({ file: name, header: JSON.parse(buf.subarray(0, nl).toString("utf8")) as DraftHeader, text: buf.subarray(nl + 1).toString("utf8") });
    } catch {
      // Replaced while it was read.
    }
  }
  return out;
}

/** A note's path as the draft store keeps it. */
export const relPath = (workspace: string, note: string) => relative(workspace, note).split(sep).join("/");

/**
 * The draft store has text for the note that the note on disk doesn't: a crash now has something
 * to bring back. Typing that goes on is kept too (the editor hands it over every 250 ms, and it's
 * written at most 150 ms later), so a journey that needs a restore crashes at such a moment, whatever
 * the computer's speed; fault injection crashes at random moments.
 */
export function draftAhead(userData: string, workspace: string, note: string): boolean {
  try {
    const disk = readFileSync(note, "utf8");
    const rel = relPath(workspace, note).toLowerCase();
    return readDrafts(userData, workspace).some((d) => d.header.path.toLowerCase() === rel && d.text !== disk);
  } catch {
    return false;
  }
}

let seeded = 0;
/**
 * Puts a draft in the store as a crashed session would have left it. `base` is the text on disk the
 * draft was typed over (hashed here); leave it out for a draft the store can't tell is current.
 */
export function seedDraft(userData: string, workspace: string, d: { path: string; text: string; base?: string; id?: string; noteId?: string; ino?: string; head?: string; at?: number; state?: "recovered" }, key = workspaceKey(workspace)): string {
  const id = d.id ?? `seed${Date.now().toString(36)}x${(seeded++).toString(36).padStart(4, "0")}`;
  const header: DraftHeader = { v: 1, draft: id, seq: 0, path: d.path, at: d.at ?? Date.now() };
  if (d.base !== undefined) header.base = textHash(d.base);
  if (d.noteId !== undefined) header.noteId = d.noteId;
  if (d.ino !== undefined) header.ino = d.ino;
  if (d.head !== undefined) header.head = d.head;
  if (d.state !== undefined) header.state = d.state;
  const dir = join(userData, "recovery", key);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.draft`), `${JSON.stringify(header)}\n${d.text}`);
  return id;
}

/** A file's ID as the draft store records it (`stat().ino`, which survives a rename). */
export const fileId = (file: string) => String(statSync(file, { bigint: true }).ino);

/**
 * Kills the main process with no warning, as a crash or power cut would. Resolves to when, once
 * it's gone. On Windows `app.process()` is a launcher whose child is the real main process, so the
 * main process's own ID is asked for and killed; its renderer and GPU processes then exit on their own.
 */
export async function crash(l: Launched, userData: string): Promise<number> {
  // Asked at launch: a call into the app now would wait on its inspector, and the crash would come
  // later than the moment typing stopped, counted as text lost.
  const pid = l.pid;
  const launcher = l.app.process();
  const closed = new Promise((r) => (launcher.exitCode !== null ? r(null) : launcher.once("exit", r)));
  const at = Date.now();
  process.kill(pid, "SIGKILL");
  if (launcher.pid !== pid) launcher.kill("SIGKILL");
  await Promise.race([closed, new Promise((r) => setTimeout(r, 5000))]);
  // The renderer and GPU processes follow the main process out. On Windows the single-instance lock
  // file goes when the last of them lets go of it; the next launch waits for that, as a person would.
  const lock = join(userData, "lockfile");
  for (let i = 0; i < 100 && process.platform === "win32" && existsSync(lock); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 200));
  return at;
}