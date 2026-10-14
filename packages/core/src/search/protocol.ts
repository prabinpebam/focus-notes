/**
 * The messages between the app and the search worker, and the app's side of them. The worker's side
 * is serve.ts. Anything with `postMessage` and a `message` event works: a Worker, the worker's own
 * global scope, a MessagePort, or Node's worker threads in the benchmark.
 */
import type { FindQuery, FindResults, IndexOp, IndexStatus, SearchIndexClient, SearchQuery, SearchResults } from "./types.ts";

export interface PortLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

export type ToWorker =
  | { type: "apply"; seq: number; ops: readonly IndexOp[] }
  | { type: "query"; id: number; query: SearchQuery }
  | { type: "find"; id: number; query: FindQuery };
export type FromWorker =
  | { type: "status"; status: IndexStatus }
  | { type: "result"; id: number; results: SearchResults }
  | { type: "found"; id: number; results: FindResults }
  | { type: "error"; id: number; message: string };

export const NO_STATUS: IndexStatus = { notes: 0, indexed: 0, pending: 0, seq: 0 };

/** The app's side: sends changes and queries in order, and follows the index's status. */
export function connectSearch(port: PortLike, dispose: () => void = () => {}): SearchIndexClient {
  let seq = 0;
  let nextId = 0;
  let current = NO_STATUS;
  const queries = new Map<number, { resolve: (r: never) => void; reject: (e: Error) => void }>();
  const listeners = new Set<(s: IndexStatus) => void>();
  let idle: ((s: IndexStatus) => void)[] = [];
  const settled = () => current.seq >= seq && current.pending === 0;
  const send = (m: ToWorker) => port.postMessage(m);

  port.addEventListener("message", ({ data }) => {
    const m = data as FromWorker;
    if (m.type === "status") {
      current = m.status;
      for (const l of [...listeners]) l(current);
      if (settled()) {
        const done = idle;
        idle = [];
        for (const r of done) r(current);
      }
    } else {
      const q = queries.get(m.id);
      queries.delete(m.id);
      if (m.type === "result" || m.type === "found") q?.resolve(m.results as never);
      else q?.reject(new Error(m.message));
    }
  });
  port.start?.();

  return {
    apply(ops) {
      if (ops.length) send({ type: "apply", seq: ++seq, ops });
    },
    query(query) {
      const id = ++nextId;
      return new Promise<SearchResults>((resolve, reject) => {
        queries.set(id, { resolve, reject });
        send({ type: "query", id, query });
      });
    },
    find(query) {
      const id = ++nextId;
      return new Promise<FindResults>((resolve, reject) => {
        queries.set(id, { resolve, reject });
        send({ type: "find", id, query });
      });
    },
    status: () => current,
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    whenIndexed: () => (settled() ? Promise.resolve(current) : new Promise((resolve) => idle.push(resolve))),
    dispose() {
      for (const q of queries.values()) q.reject(new Error("The search index stopped"));
      queries.clear();
      dispose();
    },
  };
}
