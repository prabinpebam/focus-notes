/**
 * Helpers for crash journeys (QLT-03): type with each key's time recorded, kill the main process
 * the way a crash would, and read back what a note kept.
 */
import type { Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Launched } from "./helpers.ts";

/**
 * A crash loses at most about a second of typing (QLT-03). The design keeps it under 0.8 s (the
 * editor hands text over at most 500 ms after it changed, and the journal keeps each handover within
 * 250 ms); the rest is room for a busy computer.
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

/**
 * The journal's latest record is text the note on disk doesn't have: a crash now has something to
 * bring back. Typing that goes on is saved too (the editor hands it over every 500 ms, and it's
 * written 400 ms later), so a journey that needs a restore crashes at such a moment, whatever the
 * computer's speed; fault injection crashes at random moments.
 */
export function journalAhead(userData: string, note: string): boolean {
  try {
    const last = readFileSync(join(userData, "recovery-journal.jsonl"), "utf8").trimEnd().split("\n").at(-1);
    const r = last ? (JSON.parse(last) as { op?: string; text?: string }) : undefined;
    return r?.op === "text" && r.text !== readFileSync(note, "utf8");
  } catch {
    return false;
  }
}

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
