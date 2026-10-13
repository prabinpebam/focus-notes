/** A small promise wrapper over IndexedDB for the web app's stores (Web app → Storage). */

/** A note written in this browser. Older versions also stored sync fields; they're ignored. */
export interface NoteRecord {
  path: string;
  text: string;
  updated: number;
  /**
   * Deleted in the Files panel (D-94), or by older versions for deletions waiting to sync (D-82).
   * Such notes are treated as gone; the Files panel's deletions are kept for Recently deleted.
   */
  deleted?: boolean;
}

export const DB_NAME = "focus-notes";
const VERSION = 1;

const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export class WebDb {
  readonly #db: IDBDatabase;
  private constructor(db: IDBDatabase) {
    this.#db = db;
  }

  static open(name = DB_NAME): Promise<WebDb> {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(name, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "path" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      r.onsuccess = () => resolve(new WebDb(r.result));
      r.onerror = () => reject(r.error);
    });
  }

  #store(name: "notes" | "meta", mode: IDBTransactionMode) {
    return this.#db.transaction(name, mode).objectStore(name);
  }

  allNotes(): Promise<NoteRecord[]> {
    return req(this.#store("notes", "readonly").getAll() as IDBRequest<NoteRecord[]>);
  }
  getNote(path: string): Promise<NoteRecord | undefined> {
    return req(this.#store("notes", "readonly").get(path) as IDBRequest<NoteRecord | undefined>);
  }
  async putNote(note: NoteRecord): Promise<void> {
    await req(this.#store("notes", "readwrite").put(note));
  }
  /** Moves a note to a new path in one transaction, so it's never in both places or neither. */
  async moveNote(from: string, to: string, updated: number): Promise<void> {
    const tx = this.#db.transaction("notes", "readwrite");
    const store = tx.objectStore("notes");
    const note = await req(store.get(from) as IDBRequest<NoteRecord | undefined>);
    if (!note) throw new Error(`No note at ${from}`);
    store.delete(from);
    store.put({ ...note, path: to, updated });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  /**
   * A Files panel batch in one transaction (D-94): notes put and removed, and the folder list, so
   * the batch is never half applied.
   */
  async applyBatch(put: readonly NoteRecord[], remove: readonly string[], folders?: { key: string; value: string[] }): Promise<void> {
    const tx = this.#db.transaction(["notes", "meta"], "readwrite");
    const notes = tx.objectStore("notes");
    for (const p of remove) notes.delete(p);
    for (const n of put) notes.put(n);
    if (folders) tx.objectStore("meta").put(folders.value, folders.key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async removeNote(path: string): Promise<void> {
    await req(this.#store("notes", "readwrite").delete(path));
  }
  getMeta<T>(key: string): Promise<T | undefined> {
    return req(this.#store("meta", "readonly").get(key) as IDBRequest<T | undefined>);
  }
  async setMeta(key: string, value: unknown): Promise<void> {
    await req(this.#store("meta", "readwrite").put(value, key));
  }
  async deleteMeta(key: string): Promise<void> {
    await req(this.#store("meta", "readwrite").delete(key));
  }
}
