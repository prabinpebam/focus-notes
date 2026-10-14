/**
 * The parsed-note snapshot (PRF-10, Performance and quality → Less reading): what was read or
 * written, kept in memory keyed by path, size, and modification time, so a note that hasn't
 * changed on disk is never read again. Values are deep-frozen when they go in, and each read hands
 * out a fresh top-level object over the frozen parts: a caller that changes a cached note fails
 * instead of changing everyone's copy. The least recently used entries go first once the cache is
 * over its size.
 */
import { atOrUnder } from "./journal.ts";

export interface SnapshotKey {
  path: string;
  size: number;
  mtimeMs: number;
}

/** Freezes a value and everything reachable from it. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as object)) deepFreeze(v);
  }
  return value;
}

export interface SnapshotOptions<T> {
  /** The most the cached values may add up to, by `sizeOf`. */
  maxBytes: number;
  /** How much a value costs, roughly in bytes. */
  sizeOf(value: T): number;
}

interface Slot<T> {
  size: number;
  mtimeMs: number;
  value: T;
  bytes: number;
}

export class SnapshotCache<T extends object> {
  readonly #slots = new Map<string, Slot<T>>();
  #bytes = 0;
  hits = 0;
  misses = 0;
  readonly #opts: SnapshotOptions<T>;
  constructor(opts: SnapshotOptions<T>) {
    this.#opts = opts;
  }

  /** The cached value when the file's size and modification time are the ones it was cached with. */
  get(key: SnapshotKey): T | undefined {
    const slot = this.#slots.get(key.path);
    if (!slot || slot.size !== key.size || slot.mtimeMs !== key.mtimeMs) {
      if (slot) this.#drop(key.path);
      this.misses++;
      return undefined;
    }
    // Most recently used goes last.
    this.#slots.delete(key.path);
    this.#slots.set(key.path, slot);
    this.hits++;
    return { ...slot.value };
  }

  /** Caches a value for the file as it is now. Resolves to the frozen value. */
  set(key: SnapshotKey, value: T): T {
    const frozen = deepFreeze(value);
    this.#drop(key.path);
    const bytes = this.#opts.sizeOf(frozen);
    // Something bigger than the whole cache isn't kept: it would push everything else out.
    if (bytes > this.#opts.maxBytes) return frozen;
    this.#slots.set(key.path, { size: key.size, mtimeMs: key.mtimeMs, value: frozen, bytes });
    this.#bytes += bytes;
    for (const [p] of this.#slots) {
      if (this.#bytes <= this.#opts.maxBytes) break;
      this.#drop(p);
    }
    return frozen;
  }

  /** Follows a rename: a file keeps its size and modification time when it moves. */
  move(from: string, to: string): void {
    for (const [p, slot] of [...this.#slots]) {
      if (!atOrUnder(p, from)) continue;
      this.#slots.delete(p);
      this.#slots.set(to + p.slice(from.length), slot);
    }
  }

  /** Forgets a path and everything under it. */
  delete(path: string): void {
    for (const p of [...this.#slots.keys()]) if (atOrUnder(p, path)) this.#drop(p);
  }

  clear(): void {
    this.#slots.clear();
    this.#bytes = 0;
  }

  get size(): number {
    return this.#slots.size;
  }
  get bytes(): number {
    return this.#bytes;
  }

  #drop(path: string): void {
    const slot = this.#slots.get(path);
    if (!slot) return;
    this.#slots.delete(path);
    this.#bytes -= slot.bytes;
  }
}
