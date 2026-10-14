/**
 * Helpers for crash journeys (QLT-03): type with each key's time recorded, kill the main process
 * the way a crash would, and read back what a note kept.
 */
import type { Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Launched } from "./helpers.ts";

/**
 * A crash loses at most about a second of typing (QLT-03). The design keeps it under 0.8 s (the
 * editor hands text over and the journal keeps it every 750 ms); the rest is room for a busy computer.
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

/** Types `text` key by key, `delayMs` apart, pausing where `pauses` says (index → ms). */
export async function typeTimed(page: Page, text: string, opts: { delayMs?: number; pauses?: Map<number, number> } = {}): Promise<Typed> {
  const at: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const pause = opts.pauses?.get(i);
    if (pause) await page.waitForTimeout(pause);
    at.push(Date.now());
    await page.keyboard.press(text[i] === " " ? "Space" : text[i]!);
    await page.waitForTimeout(opts.delayMs ?? 25);
  }
  return { text, at, lostMs: (kept, crashedAt) => (kept >= text.length ? 0 : crashedAt - at[Math.max(0, kept)]!) };
}

/**
 * Kills the main process with no warning, as a crash or power cut would. Resolves to when, once
 * it's gone. On Windows `app.process()` is a launcher whose child is the real main process, so the
 * main process's own ID is asked for and killed; its renderer and GPU processes then exit on their own.
 */
export async function crash(l: Launched, userData: string): Promise<number> {
  const pid = await l.app.evaluate(() => process.pid);
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
