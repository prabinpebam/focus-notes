import { createHash, randomUUID } from "node:crypto";
import { watch as watchDirectory } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { DATA_FILES } from "@focus-notes/core/inventory";
import type { FirstNoteAdmission } from "./first-project-note.ts";
import type { CleanupIssue, CleanupReason } from "@focus-notes/core";

export type MetadataTicket = { generation: string; enabled: boolean };
export type CleanupEvent = "signOut" | "removeWorkspace" | "deleteProject";
export class MetadataNotificationError extends Error {
  constructor() { super("Committed local metadata notification is pending."); this.name = "MetadataNotificationError"; }
}

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
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("CREATE TABLE IF NOT EXISTS profiles (profile TEXT PRIMARY KEY, generation TEXT NOT NULL, enabled INTEGER NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS first_notes (project TEXT PRIMARY KEY, roots TEXT NOT NULL, file TEXT NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS first_note_slots (project TEXT PRIMARY KEY, slot INTEGER NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS cleanup_pending (profile TEXT NOT NULL, scope TEXT NOT NULL, PRIMARY KEY (profile, scope))");
      if (!db.prepare("PRAGMA table_info(cleanup_pending)").all().some(row => row.name === "reason")) db.exec("ALTER TABLE cleanup_pending ADD COLUMN reason TEXT NOT NULL DEFAULT 'unknown'");
      db.exec("CREATE TABLE IF NOT EXISTS metadata_notify_pending (id INTEGER PRIMARY KEY CHECK(id = 1), revision TEXT NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS metadata_watch_failures (session TEXT NOT NULL, profile TEXT NOT NULL, kind TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(session, kind))");
      db.exec("CREATE TABLE IF NOT EXISTS cleanup_jobs (profile TEXT PRIMARY KEY, event TEXT NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS live_profiles (session TEXT PRIMARY KEY, pid INTEGER NOT NULL, profile TEXT NOT NULL, generation TEXT NOT NULL)");
      db.exec("CREATE TABLE IF NOT EXISTS removed_profiles (profile TEXT PRIMARY KEY)");
      db.exec("CREATE TABLE IF NOT EXISTS live_filters (session TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)");
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
  // The promise is also awaited by every operation; this prevents an unhandled startup rejection.
  void ready.catch(error => { console.error("Could not initialize project metadata lifecycle:", error instanceof Error ? error.name : "Error"); });
  async function notify(revision: string): Promise<void> {
    try { await writeFile(join(root, DATA_FILES.projectMetadataNotify), `${JSON.stringify(revision)}\n`); }
    catch { throw new MetadataNotificationError(); }
    await attempt(() => db.exec("BEGIN IMMEDIATE"));
    try {
      db.prepare("DELETE FROM metadata_notify_pending WHERE id = 1 AND revision = ?").run(revision);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function transaction<T>(work: () => Promise<T>, signal = true): Promise<T> {
    const result = queue.then(async () => {
      await ready;
      // SQLite owns the cross-process lock and releases it even after a hard crash. A busy
      // acquisition yields to the event loop; no synchronous busy timeout blocks note saving.
      await attempt(() => db.exec("BEGIN IMMEDIATE"));
      let value: T;
      const revision = randomUUID();
      try {
        value = await work();
        if (signal) db.prepare("INSERT INTO metadata_notify_pending (id, revision) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision").run(revision);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      // Notify after COMMIT so receivers rescan committed metadata.
      if (signal) await notify(revision);
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
  function pending(profile: string, scope: string, keep: boolean, reason: CleanupReason = scope === "open-windows" ? "window-ack" : "unknown"): void {
    if (keep) db.prepare("INSERT INTO cleanup_pending (profile, scope, reason) VALUES (?, ?, ?) ON CONFLICT(profile, scope) DO UPDATE SET reason = excluded.reason").run(key(profile), scope, reason);
    else db.prepare("DELETE FROM cleanup_pending WHERE profile = ? AND scope = ?").run(key(profile), scope);
  }
  async function pendingScopes(): Promise<string[]> {
    return (await cleanupIssues()).map(issue => issue.scope);
  }
  async function cleanupIssues(): Promise<CleanupIssue[]> {
    await ready;
    await queue;
    const issues: CleanupIssue[] = db.prepare("SELECT profile, scope, reason FROM cleanup_pending ORDER BY profile, scope").all().map(row => {
      if (!["file-lock", "window-ack", "notify", "watch", "unknown"].includes(String(row.reason))) throw new Error("Invalid cleanup failure reason.");
      return { scope: `${String(row.profile).slice(0, 12)}:${String(row.scope)}`, reason: row.reason as CleanupReason };
    });
    if (db.prepare("SELECT revision FROM metadata_notify_pending WHERE id = 1").get()) issues.push({ scope: `${key(root).slice(0, 12)}:metadata-notify`, reason: "notify" });
    for (const row of db.prepare("SELECT profile, kind FROM metadata_watch_failures ORDER BY profile, kind").all()) {
      issues.push({ scope: `${String(row.profile).slice(0, 12)}:${String(row.kind)}`, reason: row.kind === "metadata-watch" ? "watch" : "window-ack" });
    }
    return issues;
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
  const localWatches = new Map<string, () => Promise<void>>();
  const localStops = new Set<() => Promise<void>>();
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
    const failure = (kind: string, revision: string) => transaction(async () => {
      db.prepare("INSERT INTO metadata_watch_failures (session, profile, kind, revision) VALUES (?, ?, ?, ?) ON CONFLICT(session, kind) DO UPDATE SET revision = excluded.revision WHERE revision != excluded.revision").run(session, key(profile), kind, revision);
    }, false);
    const acknowledge = (kind: string, revision: string) => {
      db.prepare("DELETE FROM metadata_watch_failures WHERE session = ? AND kind = ? AND revision = ?").run(session, kind, revision);
    };
    const check = async () => {
      if (stopped) return;
      await queue;
      const nextRemoved = removedKey();
      if (nextRemoved !== removed) {
        try { await filtered(); }
        catch (error) { await failure("window-filter", nextRemoved); throw error; }
        if (stopped) return;
        await transaction(async () => {
          if (removedKey() !== nextRemoved) { dirty = true; return; }
          db.prepare("UPDATE live_filters SET fingerprint = ? WHERE session = ?").run(nextRemoved, session);
          db.prepare("DELETE FROM metadata_watch_failures WHERE session = ? AND kind = 'window-filter'").run(session);
        });
        removed = nextRemoved;
      }
      const current = await ticket(profile);
      if (current.generation === observed.generation) return;
      if (!current.enabled) {
        try { await cleared(current); }
        catch (error) { await failure("window-ack", current.generation); throw error; }
      }
      if (stopped) return;
      await transaction(async () => {
        if (read(profile).generation !== current.generation) { dirty = true; return; }
        db.prepare("UPDATE live_profiles SET generation = ? WHERE session = ?").run(current.generation, session);
        db.prepare("DELETE FROM metadata_watch_failures WHERE session = ? AND kind = 'window-ack'").run(session);
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
    let watcher: ReturnType<typeof watchDirectory> | undefined;
    const register = async () => {
      watcher?.close();
      try {
        const registered = watchDirectory(root, schedule);
        watcher = registered;
        let failed = false;
        registered.on("error", error => {
          if (stopped || watcher !== registered) return;
          failed = true;
          console.error("Could not observe local cleanup:", error.name);
          void failure("metadata-watch", session).catch(error => console.error("Could not record local cleanup failure:", error instanceof Error ? error.name : "Error"));
        });
        await transaction(async () => {
          if (!stopped && watcher === registered && !failed) acknowledge("metadata-watch", session);
        }, false);
      } catch (error) { await failure("metadata-watch", session); throw error; }
    };
    localWatches.set(session, async () => {
      if (stopped) return;
      await register();
      schedule();
      await checking;
    });
    try { await register(); }
    catch (error) { console.error("Could not observe local cleanup:", error instanceof Error ? error.name : "Error"); }
    schedule();
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      localStops.delete(stop);
      localWatches.delete(session);
      watcher?.close();
      await checking;
      await transaction(async () => {
        db.prepare("DELETE FROM live_profiles WHERE session = ?").run(session);
        db.prepare("DELETE FROM live_filters WHERE session = ?").run(session);
        db.prepare("DELETE FROM metadata_watch_failures WHERE session = ?").run(session);
      });
    };
    localStops.add(stop);
    return stop;
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
        try {
          process.kill(Number(row.pid), 0);
          if (generationPending || (includeFiltered && row.fingerprint !== fingerprint)) waiting = true;
        }
        catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ESRCH") throw error;
          await transaction(async () => {
            db.prepare("DELETE FROM live_profiles WHERE session = ?").run(String(row.session));
            db.prepare("DELETE FROM live_filters WHERE session = ?").run(String(row.session));
            db.prepare("DELETE FROM metadata_watch_failures WHERE session = ?").run(String(row.session));
          });
        }
      }
      if (!waiting) return;
      if (Date.now() >= deadline) throw new Error("Open project windows have not acknowledged cleanup.");
      await delay(25);
    }
  }
  async function repairNotifications(profiles: readonly string[]): Promise<void> {
    await transaction(async () => {});
    for (const repair of localWatches.values()) await repair();
    await waitForLive(profiles, true);
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
    try {
      for (const stop of [...localStops]) await stop();
      await ready;
    } finally {
      await queue;
      db.close();
    }
  }
  return { initialize, ticket, change, invalidate, pending, pendingScopes, cleanupIssues, repairNotifications, job, jobs, profileId: key, markRemoved, isRemoved, watch, waitForLive, commit, firstNoteAdmission, transaction, dispose };
}
