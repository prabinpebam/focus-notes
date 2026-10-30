import type { DraftCrypt } from "./drafts.ts";
import { RewriteConnection } from "./rewrite-connection.ts";

type Envelope = NonNullable<ReturnType<RewriteConnection["envelope"]>>;
type Storage = {
  load(): Promise<Envelope | undefined>;
  checkpoint(): Promise<void>;
  /** Must preserve the old envelope on failure (temporary file + atomic rename). */
  persist(value: Envelope): Promise<void>;
  remove(): Promise<void>;
};

/** Main-owned queue: provisional credentials are never visible to settings or streams. */
export class RewriteConnectionTransaction {
  #committed: RewriteConnection;
  #ready: Promise<void>;
  #tail: Promise<unknown> = Promise.resolve();
  private crypt: DraftCrypt;
  private storage: Storage;
  constructor(crypt: DraftCrypt, storage: Storage) {
    this.crypt = crypt; this.storage = storage;
    this.#committed = new RewriteConnection(crypt);
    this.#ready = storage.load().then((value) => { if (value) this.#committed.restore(value); });
    // Load failures are still surfaced to callers, without an unhandled startup rejection.
    void this.#ready.catch(() => {});
  }
  async settings() { await this.#ready; return this.#committed.settings(); }
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(async () => { await this.#ready; return operation(); });
    this.#tail = result.catch(() => {});
    return result;
  }
  configure(input: Parameters<RewriteConnection["configure"]>[0]) {
    return this.#enqueue(async () => {
      const provisional = new RewriteConnection(this.crypt);
      await provisional.configure(input);
      await this.storage.checkpoint();
      await this.storage.persist(provisional.envelope()!);
      this.#committed = provisional;
      return provisional.settings();
    });
  }
  remove() {
    return this.#enqueue(async () => {
      await this.storage.remove();
      this.#committed = new RewriteConnection(this.crypt);
      return this.#committed.settings();
    });
  }
  async *stream(request: Parameters<RewriteConnection["stream"]>[0]) {
    await this.#ready;
    yield* this.#committed.stream(request);
  }
}
