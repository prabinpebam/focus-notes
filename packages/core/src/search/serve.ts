/**
 * The worker's side of the search protocol: changes apply in order as they arrive, and texts are
 * indexed in short slices between messages, so a query never waits behind a big batch (SPT-07).
 * Removals (a note deleted, the vault locked) apply at once, before any later query.
 */
import { SearchEngine } from "./engine.ts";
import { connectSearch, type FromWorker, type PortLike, type ToWorker } from "./protocol.ts";
import type { SearchIndexClient } from "./types.ts";

/** How long the index works on texts before it looks at its messages again. */
export const SLICE_MS = 8;
/** While indexing, how often it says how far it's got. */
const STATUS_EVERY_MS = 100;

export function serveSearch(port: PortLike, engine = new SearchEngine()): SearchEngine {
  let seq = 0;
  let scheduled = false;
  let said = 0;
  // `port.postMessage` is looked up on each call: in a worker, the port is its global scope.
  const post = (m: FromWorker) => port.postMessage(m);
  const status = () => {
    said = Date.now();
    post({ type: "status", status: engine.status(seq) });
  };
  const tick = () => {
    scheduled = false;
    const more = engine.work(SLICE_MS);
    if (!more) {
      engine.tidy();
      status();
    }
    else {
      if (Date.now() - said >= STATUS_EVERY_MS) status();
      schedule();
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(tick, 0);
  };
  port.addEventListener("message", ({ data }) => {
    const m = data as ToWorker;
    if (m.type === "apply") {
      seq = m.seq;
      engine.apply(m.ops);
      status();
      if (engine.status().pending) schedule();
    } else if (m.type === "query" || m.type === "find") {
      try {
        post(m.type === "query" ? { type: "result", id: m.id, results: engine.query(m.query) } : { type: "found", id: m.id, results: engine.find(m.query) });
      } catch (e) {
        post({ type: "error", id: m.id, message: e instanceof Error ? e.message : String(e) });
      }
    }
  });
  port.start?.();
  return engine;
}

/**
 * Two ports joined to each other, delivering like a worker does: later, in order, and as copies
 * (structured clone), so nothing is shared by accident.
 */
export function loopback(): [PortLike, PortLike] {
  const ends = [new Set<(e: { data: unknown }) => void>(), new Set<(e: { data: unknown }) => void>()] as const;
  const port = (mine: 0 | 1): PortLike => ({
    postMessage(message) {
      const data = structuredClone(message);
      setTimeout(() => { for (const l of ends[mine === 0 ? 1 : 0]) l({ data }); }, 0);
    },
    addEventListener: (_type, listener) => void ends[mine].add(listener),
  });
  return [port(0), port(1)];
}

/** The index on this thread, through the same messages as the worker: for tests. */
export function localSearch(engine = new SearchEngine()): SearchIndexClient & { engine: SearchEngine } {
  const [app, worker] = loopback();
  serveSearch(worker, engine);
  return Object.assign(connectSearch(app), { engine });
}
