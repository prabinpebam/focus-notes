/**
 * Where the share reader keeps its session (SHR-10, D-125, security review M1, L2, L5). The session's key
 * is a non-extractable AES-GCM CryptoKey, so it's kept only in IndexedDB, by structured clone, which
 * keeps it non-extractable: script on this origin can use it while it's there, but can't copy it out.
 * Text storage holds nothing secret: sessionStorage holds only this tab's random record ID, and
 * localStorage only when this device last signed out. A tab's record ends after 12 hours unused; a
 * remembered one when its grant ends (or after 30 days unused for a grant that never expires); any
 * record saved before the last sign-out is ignored and deleted. Sign-out reaches every tab (BroadcastChannel).
 */
import { pickSession, type SessionStore, type StoredShare } from "@focus-notes/core/share-reader";
import { randomBytes, toB64url, type ShareSession } from "@focus-notes/seal";

const KEY = "focus-notes.share";
const SIGNED_OUT = "focus-notes.share.signedOutAt";
const DB = "focus-notes-share";
const STORE = "sessions";

type Row = StoredShare & ShareSession;

const request = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const openDb = () => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
  return request(r);
};
async function inStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    const out = await run(tx.objectStore(STORE));
    await done;
    return out;
  } finally { db.close(); }
}
const session = (r: Row): ShareSession => ({ v: r.v, via: r.via, ref: r.ref, key: r.key, expiresAt: r.expiresAt });

export function createSessionStore(): SessionStore {
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(KEY) : undefined;
  return {
    async load() {
      const now = Date.now();
      const tabId = sessionStorage.getItem(KEY) ?? undefined;
      const signedOutAt = Number(localStorage.getItem(SIGNED_OUT)) || 0;
      const use = await inStore("readwrite", async (s) => {
        const rows = (await request(s.getAll())) as Row[];
        const { use, drop } = pickSession(rows, { now, signedOutAt, tabId });
        for (const id of drop) s.delete(id);
        // Each use renews it.
        if (use) s.put({ ...use, usedAt: now });
        return use;
      }).catch(() => undefined);
      if (!use) { sessionStorage.removeItem(KEY); return undefined; }
      sessionStorage.setItem(KEY, use.id);
      return { session: session(use), remembered: use.remembered };
    },
    async save(value, remembered) {
      const now = Date.now();
      const id = sessionStorage.getItem(KEY) ?? toB64url(randomBytes(16));
      const row: Row = { ...(value as ShareSession), id, remembered, savedAt: now, usedAt: now };
      await inStore("readwrite", async (s) => {
        // One remembered share per device.
        if (remembered) for (const r of (await request(s.getAll())) as Row[]) if (r.remembered && r.id !== id) s.delete(r.id);
        s.put(row);
      });
      sessionStorage.setItem(KEY, id);
    },
    async forget() {
      const id = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      if (id) await inStore("readwrite", async (s) => void s.delete(id)).catch(() => {});
    },
    signOut() {
      localStorage.setItem(SIGNED_OUT, String(Date.now()));
      sessionStorage.removeItem(KEY);
      void inStore("readwrite", async (s) => void s.clear()).catch(() => {});
      channel?.postMessage("signOut");
    },
    onSignedOut(listener) {
      const onMessage = (e: MessageEvent) => {
        if (e.data !== "signOut") return;
        sessionStorage.removeItem(KEY);
        listener();
      };
      channel?.addEventListener("message", onMessage);
      return () => channel?.removeEventListener("message", onMessage);
    },
  };
}
