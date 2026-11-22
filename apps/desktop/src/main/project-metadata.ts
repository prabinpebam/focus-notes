import { createHash, randomUUID } from "node:crypto";
import { watch as watchDirectory } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { DATA_FILES } from "@focus-notes/core/inventory";
import type { FirstNoteAdmission } from "./first-project-note.ts";

export type MetadataTicket = { generation: string; enabled: boolean };
export type CleanupEvent = "signOut" | "removeWorkspace" | "deleteProject";

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
    db.exec("CREATE TABLE IF NOT EXISTS cleanup_pending (profile TEXT NOT NULL, scope TEXT NOT NULL, PRIMARY KEY (profile, scope))");
    db.exec("CREATE TABLE IF NOT EXISTS cleanup_jobs (profile TEXT PRIMARY KEY, event TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS live_profiles (session TEXT PRIMARY KEY, pid INTEGER NOT NULL, profile TEXT NOT NULL, generation TEXT NOT NULL)");
    db.exec("CREATE TABLE IF NOT EXISTS removed_profiles (profile TEXT PRIMARY KEY)");
    db.exec("CREATE TABLE IF NOT EXISTS live_filters (session TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)");
  });
  // The promise is also awaited by every operation; this prevents an unhandled startup rejection.
  void ready.catch(error => { console.error("Could not initialize project metadata lifecycle:", error instanceof Error ? error.name : "Error"); });
  function transaction<T>(work: () => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      await ready;
      // SQLite owns the cross-process lock and releases it even after a hard crash. A busy
      // acquisition yields to the event loop; no synchronous busy timeout blocks note saving.
      await attempt(() => db.exec("BEGIN IMMEDIATE"));
      let value: T;
      try {
        value = await work();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      // Notify after COMMIT so receivers rescan committed metadata.
      await writeFile(join(root, DATA_FILES.projectMetadataNotify), `${JSON.stringify(randomUUID())}\n`);
      return value;
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
      if (enabled) db.prepare("DELETE FROM removed_profiles WHERE profile = ?").run(key(profile));
      return read(profile);
    });
  }
  function markRemoved(profile: string): void {
    db.prepare("INSERT OR IGNORE INTO removed_profiles (profile) VALUES (?)").run(key(profile));
  }
  async function isRemoved(profile: string): Promise<boolean> {
    await ready;
    return Boolean(db.prepare("SELECT profile FROM removed_profiles WHERE profile = ?").get(key(profile)));
  }
  function invalidate(profiles: readonly string[], prepare?: (tickets: ReadonlyMap<string, MetadataTicket>) => void): Promise<void> {
    return transaction(async () => {
      const tickets = new Map<string, MetadataTicket>();
      for (const profile of profiles) {
        db.prepare("INSERT INTO profiles (profile, generation, enabled) VALUES (?, ?, 0) ON CONFLICT(profile) DO UPDATE SET generation = excluded.generation, enabled = 0").run(key(profile), randomUUID());
        tickets.set(profile, read(profile));
      }
      prepare?.(tickets);
    });
  }
  function pending(profile: string, scope: string, keep: boolean): void {
    if (keep) db.prepare("INSERT OR IGNORE INTO cleanup_pending (profile, scope) VALUES (?, ?)").run(key(profile), scope);
    else db.prepare("DELETE FROM cleanup_pending WHERE profile = ? AND scope = ?").run(key(profile), scope);
  }
  async function pendingScopes(): Promise<string[]> {
    await ready;
    return db.prepare("SELECT profile, scope FROM cleanup_pending ORDER BY profile, scope").all().map(row => `${String(row.profile).slice(0, 12)}:${String(row.scope)}`);
  }
  function job(profile: string, event: CleanupEvent, keep: boolean): void {
    if (keep) db.prepare("INSERT INTO cleanup_jobs (profile, event) VALUES (?, ?) ON CONFLICT(profile) DO UPDATE SET event = excluded.event").run(key(profile), event);
    else db.prepare("DELETE FROM cleanup_jobs WHERE profile = ?").run(key(profile));
  }
  async function jobs(): Promise<{ profile: string; event: CleanupEvent }[]> {
    await ready;
    return db.prepare("SELECT profile, event FROM cleanup_jobs").all().map(row => {
      if (typeof row.profile !== "string" || !["signOut", "removeWorkspace", "deleteProject"].includes(String(row.event))) throw new Error("Invalid pending cleanup.");
      return { profile: row.profile, event: row.event as CleanupEvent };
    });
  }
  async function watch(profile: string, cleared: (ticket: MetadataTicket) => Promise<void>, filtered: () => Promise<void> = async () => {}) {
    const session = randomUUID();
    let observed = await initialize(profile);
    const removedKey = () => JSON.stringify(db.prepare("SELECT profile FROM removed_profiles ORDER BY profile").all());
    let removed = db.prepare("SELECT profile FROM removed_profiles LIMIT 1").get() ? "" : removedKey();
    await transaction(async () => {
      db.prepare("INSERT INTO live_profiles (session, pid, profile, generation) VALUES (?, ?, ?, ?)").run(session, process.pid, key(profile), observed.generation);
      db.prepare("INSERT INTO live_filters (session, fingerprint) VALUES (?, ?)").run(session, removed);
    });
    let checking: Promise<void> | undefined;
    let stopped = false;
    let dirty = false;
    const check = async () => {
      await queue;
      const nextRemoved = removedKey();
      if (nextRemoved !== removed) {
        await filtered();
        await transaction(async () => { db.prepare("UPDATE live_filters SET fingerprint = ? WHERE session = ?").run(nextRemoved, session); });
        removed = nextRemoved;
      }
      const current = await ticket(profile);
      if (current.generation === observed.generation) return;
      if (!current.enabled) await cleared(current);
      await transaction(async () => {
        db.prepare("UPDATE live_profiles SET generation = ? WHERE session = ?").run(current.generation, session);
      });
      observed = current;
    };
    function schedule() {
      dirty = true;
      if (checking || stopped) return;
      checking = (async () => {
        while (dirty && !stopped) {
          dirty = false;
          await check();
        }
      })().catch(error => {
        console.error("Local cleanup acknowledgement failed:", error instanceof Error ? error.name : "Error");
      }).finally(() => {
        checking = undefined;
        if (dirty && !stopped) schedule();
      });
    }
    // Filename filtering can discard delivered events; the committed DB is authoritative.
    const watcher = watchDirectory(root, schedule);
    watcher.on("error", error => {
      console.error("Could not observe local cleanup:", error.name);
    });
    schedule();
    return async () => {
      stopped = true;
      watcher.close();
      await checking;
      await transaction(async () => {
        db.prepare("DELETE FROM live_profiles WHERE session = ?").run(session);
        db.prepare("DELETE FROM live_filters WHERE session = ?").run(session);
      });
    };
  }
  async function waitForLive(profiles: readonly string[], includeFiltered = false): Promise<void> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      await ready;
      const fingerprint = JSON.stringify(db.prepare("SELECT profile FROM removed_profiles ORDER BY profile").all());
      const rows = db.prepare("SELECT live_profiles.session AS session, pid, profile, live_profiles.generation AS acknowledged, profiles.generation AS current, fingerprint FROM live_profiles JOIN profiles USING(profile) LEFT JOIN live_filters USING(session)").all();
      let waiting = false;
      for (const row of rows) {
        const generationPending = profiles.some(profile => key(profile) === row.profile) && row.acknowledged !== row.current;
        if (!generationPending && !(includeFiltered && row.fingerprint !== fingerprint)) continue;
        try { process.kill(Number(row.pid), 0); waiting = true; }
        catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") throw error;
          await transaction(async () => {
            db.prepare("DELETE FROM live_profiles WHERE session = ?").run(String(row.session));
            db.prepare("DELETE FROM live_filters WHERE session = ?").run(String(row.session));
          });
        }
      }
      if (!waiting) return;
      if (Date.now() >= deadline) throw new Error("Open project windows have not acknowledged cleanup.");
      await delay(25);
    }
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
  return { initialize, ticket, change, invalidate, pending, pendingScopes, job, jobs, profileId: key, markRemoved, isRemoved, watch, waitForLive, commit, firstNoteAdmission, transaction, dispose };
}
