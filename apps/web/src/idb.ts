/** A small promise wrapper over IndexedDB for the web app's stores (Web app → Storage and sync). */
import type { NoteRecord } from "@focus-notes/github";

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
