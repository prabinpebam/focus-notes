/**
 * Safe read-only reader for legacy browser drafts (WEB-01, D-292, D-412).
 * Reads non-deleted drafts from both the retired web app's IndexedDB (`focus-notes`) and the
 * retired demo's IndexedDB (`focus-notes-demo`). Never writes to or deletes from IndexedDB, and
 * never touches the share reader's `focus-notes-share` database.
 */
import { WEB_DATABASE } from "@focus-notes/core/inventory";
import type { BrowserDraft } from "@focus-notes/core/web-export";

export const LEGACY_DEMO_DATABASE = "focus-notes-demo";
export const LEGACY_DRAFT_DATABASES = [WEB_DATABASE, LEGACY_DEMO_DATABASE] as const;

interface StoredNoteRecord {
  path?: unknown;
  text?: unknown;
  updated?: unknown;
  deleted?: unknown;
}

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

async function existingDatabaseNames(idb: IDBFactory): Promise<Set<string> | undefined> {
  if (typeof idb.databases !== "function") return undefined;
  try {
    const list = await idb.databases();
    return new Set(list.map((d) => d.name).filter((n): n is string => typeof n === "string"));
  } catch {
    return undefined;
  }
}

async function readNotesFromDatabase(idb: IDBFactory, name: string): Promise<BrowserDraft[]> {
  let created = false;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = idb.open(name);
    r.onupgradeneeded = () => {
      // Do not create stores or leave an initialized schema if the database didn't exist.
      created = true;
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  try {
    if (created || !db.objectStoreNames.contains("notes")) return [];
    const tx = db.transaction("notes", "readonly");
    const rows = (await req(tx.objectStore("notes").getAll())) as StoredNoteRecord[];
    return rows
      .filter((n) => !n.deleted && typeof n.path === "string" && typeof n.text === "string")
      .map((n) => ({
        path: n.path as string,
        text: n.text as string,
        updated: typeof n.updated === "number" && Number.isFinite(n.updated) ? n.updated : 0,
      }));
  } finally {
    db.close();
  }
}

function uniquePath(path: string, seen: Set<string>, prefix: string): string {
  if (!seen.has(path)) {
    seen.add(path);
    return path;
  }
  const prefixed = `${prefix}/${path}`;
  if (!seen.has(prefixed)) {
    seen.add(prefixed);
    return prefixed;
  }
  for (let i = 2; ; i++) {
    const candidate = `${prefix}-${i}/${path}`;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      return candidate;
    }
  }
}

/**
 * Collects every non-deleted draft from the retired browser databases without modifying or deleting
 * any IndexedDB record. Path collisions between `focus-notes` and `focus-notes-demo` are disambiguated
 * with a `demo/` prefix so no draft is overwritten.
 */
export async function readBrowserDrafts(idb: IDBFactory | undefined = globalThis.indexedDB): Promise<BrowserDraft[]> {
  if (!idb) return [];
  const known = await existingDatabaseNames(idb);
  const seen = new Set<string>();
  const drafts: BrowserDraft[] = [];

  for (const name of LEGACY_DRAFT_DATABASES) {
    if (known && !known.has(name)) continue;
    const rows = await readNotesFromDatabase(idb, name);
    for (const row of rows) {
      const path = name === LEGACY_DEMO_DATABASE ? uniquePath(row.path, seen, "demo") : uniquePath(row.path, seen, "browser");
      drafts.push({ ...row, path });
    }
  }
  return drafts;
}
