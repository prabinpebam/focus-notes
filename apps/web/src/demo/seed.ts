/**
 * The demo's notes in the browser (WP-10.6, D-177): seeded from the sample notes on the first visit,
 * and put back by Reset demo. Its own database, never the owner's notes, /n/ or the vault.
 */
import { DEMO_NOTES } from "./notes.ts";

/** The demo's own IndexedDB database: a visitor's notes in the web app at /app/ are never touched. */
export const DEMO_DATABASE = "focus-notes-demo";
/** Set once the sample notes are written, so a visitor's deletions stay deleted. */
export const SEEDED = "demoSeeded";
/** Set by Reset demo, so the next start opens like a first visit (at the welcome note's top). */
export const FRESH = "demoFresh";

/** What seeding needs of the store (the web app's WebDb). */
export interface DemoStore {
  putNote(n: { path: string; text: string; updated: number }): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
  /** Empties notes and meta (Reset demo). */
  clear(): Promise<void>;
}

/** Writes the sample notes on the first visit, the first one newest. Returns whether it did. */
export async function seedDemo(db: DemoStore, now = Date.now()): Promise<boolean> {
  if (await db.getMeta<boolean>(SEEDED)) return false;
  for (const [i, n] of DEMO_NOTES.entries()) await db.putNote({ path: n.path, text: n.text, updated: now - i * 60_000 });
  await db.setMeta(SEEDED, true);
  return true;
}

/** Reset demo: everything the visitor changed is gone, and the sample notes are back. */
export async function resetDemo(db: DemoStore, now = Date.now()): Promise<void> {
  await db.clear();
  await seedDemo(db, now);
  await db.setMeta(FRESH, true);
}

/**
 * Seeds on the first visit, and says whether this start is a fresh one: the first visit, or the
 * first start after Reset demo (D-177).
 */
export async function startDemo(db: DemoStore, now = Date.now()): Promise<boolean> {
  if (await seedDemo(db, now)) return true;
  if (!(await db.getMeta<boolean>(FRESH))) return false;
  await db.setMeta(FRESH, false);
  return true;
}
