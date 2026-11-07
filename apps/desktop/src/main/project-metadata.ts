import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { DATA_FILES } from "@focus-notes/core/inventory";
import type { FirstNoteAdmission } from "./first-project-note.ts";

export type MetadataTicket = { generation: string; enabled: boolean };

export function projectMetadataStore(root: string) {
  const db = new DatabaseSync(join(root, DATA_FILES.projectMetadata), { timeout: 0 });
  const key = (profile: string) => createHash("sha256").update(process.platform === "win32" ? resolve(profile).toLowerCase() : resolve(profile)).digest("hex");
  let queue = Promise.resolve();
  const busy = (error: unknown) => error instanceof Error && "errcode" in error && (error.errcode === 5 || error.errcode === 6);
  async function attempt<T>(work: () => T): Promise<T> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      try { return work(); }
      catch (error) {
        if (!busy(error) || Date.now() >= deadline) throw error;
        await delay(20);
      }
    }
  }
  const ready = attempt(() => {
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("CREATE TABLE IF NOT EXISTS profiles (profile TEXT PRIMARY KEY, generation TEXT NOT NULL, enabled INTEGER NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS first_notes (project TEXT PRIMARY KEY, roots TEXT NOT NULL, file TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS first_note_slots (project TEXT PRIMARY KEY, slot INTEGER NOT NULL)");
  });
  // The promise is also awaited by every operation; this prevents an unhandled startup rejection.
  void ready.catch(error => { console.error("Could not initialize project metadata lifecycle:", error instanceof Error ? error.name : "Error"); });
  function transaction<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      await ready;
      // SQLite owns the cross-process lock and releases it even after a hard crash. A busy
      // acquisition yields to the event loop; no synchronous busy timeout blocks note saving.
      await attempt(() => db.exec("BEGIN IMMEDIATE"));
      try {
        const value = await work();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    });
    queue = result.then(() => {}, () => {});
    return result;
  }
  function read(profile: string): MetadataTicket {
    const row = db.prepare("SELECT generation, enabled FROM profiles WHERE profile = ?").get(key(profile));
    if (!row || typeof row.generation !== "string" || typeof row.enabled !== "number") throw new Error("Open this project before changing its saved metadata.");
    return { generation: row.generation, enabled: row.enabled === 1 };
  }
  function initialize(profile: string): Promise<MetadataTicket> {
    return transaction(async () => {
      db.prepare("INSERT OR IGNORE INTO profiles (profile, generation, enabled) VALUES (?, ?, 1)").run(key(profile), randomUUID());
      return read(profile);
    });
  }
  async function ticket(profile: string): Promise<MetadataTicket> {
    await ready;
    return read(profile);
  }
  function change(profile: string, enabled: boolean): Promise<MetadataTicket> {
    return transaction(async () => {
      db.prepare("UPDATE profiles SET generation = ?, enabled = ? WHERE profile = ?").run(randomUUID(), enabled ? 1 : 0, key(profile));
      return read(profile);
    });
  }
  function commit<T>(profile: string, expected: MetadataTicket, work: () => Promise<T>): Promise<T> {
    return transaction(async () => {
      const current = read(profile);
      if (!current.enabled || !expected.enabled || current.generation !== expected.generation) throw new Error("This project's saved metadata was cleared. Open it again before changing its pins.");
      return work();
    });
  }
  const firstNoteAdmission: FirstNoteAdmission = (roots, work) => transaction(async () => {
    const project = createHash("sha256").update(JSON.stringify(roots.map(root => process.platform === "win32" ? root.toLowerCase() : root))).digest("hex");
    const row = db.prepare("SELECT roots, file, slot FROM first_notes LEFT JOIN first_note_slots USING (project) WHERE project = ?").get(project);
    if (row && (typeof row.roots !== "string" || typeof row.file !== "string")) throw new Error("The first note's certificate is unreadable");
    if (row && row.slot !== null && (typeof row.slot !== "number" || !Number.isSafeInteger(row.slot) || row.slot < 1 || row.slot > 10_000)) throw new Error("The first note's slot is unreadable");
    return work(row ? { roots: String(row.roots), file: String(row.file), slot: row.slot === null ? 1 : Number(row.slot) } : undefined, certificate => {
      db.prepare("INSERT INTO first_notes (project, roots, file) VALUES (?, ?, ?) ON CONFLICT(project) DO UPDATE SET roots = excluded.roots, file = excluded.file").run(project, certificate.roots, certificate.file);
      db.prepare("INSERT INTO first_note_slots (project, slot) VALUES (?, ?) ON CONFLICT(project) DO UPDATE SET slot = excluded.slot").run(project, certificate.slot ?? 1);
    });
  });
  async function dispose(): Promise<void> {
    await ready.catch(() => {});
    await queue;
    db.close();
  }
  return { initialize, ticket, change, commit, firstNoteAdmission, transaction, dispose };
}
